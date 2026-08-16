/*
 * Simulated IoT Environmental Monitor — ESP32 / FreeRTOS
 * ---------------------------------------------------------------
 * Wokwi project: https://wokwi.com  (paste this + diagram.json)
 *
 * Demonstrates, in one cohesive project:
 *   - Multiple FreeRTOS tasks with distinct priorities
 *   - Mutex-protected shared state   (Task: SensorTask -> Task: StatusTask)
 *   - Queue-based producer/consumer  (Task: SensorTask -> Task: NetworkTask)
 *   - Interrupt-driven "emergency" event that jumps the queue
 *   - WiFi + MQTT publish of sensor JSON
 *   - Commented power-awareness notes for a battery-powered redesign
 *
 * WHY two patterns for the same data (mutex AND queue)?
 *   - The mutex protects a single "latest value" that multiple tasks may
 *     read/overwrite at any time (shared STATE).
 *   - The queue moves discrete READINGS from producer to consumer without
 *     either task touching the other's memory (ownership transfer, buffering,
 *     natural backpressure if the network task falls behind).
 *   Using both, deliberately, is the point: they solve different problems.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// ---------- Pin map (matches diagram.json) ----------
#define DHTPIN            15
#define DHTTYPE           DHT22
#define STATUS_LED_PIN    2
#define SPEED_BUTTON_PIN  4    // hold to blink faster (polled, Day 1 style)
#define EMERGENCY_BTN_PIN 5    // wired as a real interrupt (Day 6)

// ---------- WiFi / MQTT config ----------
const char* WIFI_SSID   = "Wokwi-GUEST";   // Wokwi's simulated network
const char* WIFI_PASS   = "";
const char* MQTT_BROKER = "broker.hivemq.com";   // free public test broker
const int   MQTT_PORT   = 1883;
const char* MQTT_TOPIC  = "silabs-prep/envmonitor/readings";
const char* MQTT_CLIENT_ID = "esp32-envmonitor-sim";

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------- Shared state (Day 4: mutex) ----------
struct SensorData {
  float temperature;
  float humidity;
  uint32_t readingCount;
};

SensorData g_latestReading;
SemaphoreHandle_t g_dataMutex;

// ---------- Queue (Day 5: producer/consumer) ----------
// Each item is one reading, timestamped, headed for the network task.
struct QueueItem {
  float temperature;
  float humidity;
  bool  isEmergency;   // true if pushed by the ISR path
};
QueueHandle_t g_readingQueue;
#define QUEUE_LENGTH 10

// ---------- Interrupt flag (Day 6) ----------
volatile bool g_emergencyFlagISR = false;
portMUX_TYPE g_isrMux = portMUX_INITIALIZER_UNLOCKED;

// Blink speed shared between SpeedButton (polled) and StatusTask.
volatile int g_blinkDelayMs = 500;

// =================================================================
// ISR — Day 6: keep it SHORT. No sensor reads, no printf, no delay.
// It only flips a flag and (from a task-safe context) the actual
// queue push happens in the task that services this flag, using the
// ISR-safe FromISR API is reserved for genuinely time-critical pushes.
// Here we keep the ISR to the bare minimum: set flag, done.
// =================================================================
void IRAM_ATTR onEmergencyButtonPress() {
  portENTER_CRITICAL_ISR(&g_isrMux);
  g_emergencyFlagISR = true;
  portEXIT_CRITICAL_ISR(&g_isrMux);
}

// =================================================================
// Task A — SensorTask (priority 2, higher than blink)
// Reads DHT22 every 2s. Writes to the mutex-protected struct AND
// pushes the same reading onto the queue for the network task.
//
// NOTE: on Day 2-3 we deliberately set this task's priority too low
// once, and watched blink starve sensor reads in the serial monitor.
// Priority 2 here is the corrected value — sensor reads are the more
// time-sensitive of the two under normal operation.
// =================================================================
void SensorTask(void *pvParameters) {
  const TickType_t xDelay = pdMS_TO_TICKS(2000);

  for (;;) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(h) && !isnan(t)) {
      // --- mutex-protected write ---
      if (xSemaphoreTake(g_dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        g_latestReading.temperature = t;
        g_latestReading.humidity = h;
        g_latestReading.readingCount++;
        xSemaphoreGive(g_dataMutex);
      }
      // Without the mutex above: StatusTask could read g_latestReading
      // mid-write (torn read), e.g. new temperature paired with the
      // OLD humidity value, or vice versa. Harmless-looking here, but
      // in a real system (e.g. a threshold-triggered alarm) a torn
      // read can trigger a false alarm or miss a real one.

      // --- queue push (producer) ---
      QueueItem item = { t, h, false };
      if (xQueueSend(g_readingQueue, &item, pdMS_TO_TICKS(50)) != pdTRUE) {
        Serial.println("[SensorTask] queue full, dropping reading");
        // A full queue means NetworkTask (consumer) is falling behind
        // (e.g. WiFi hiccup). Dropping is a deliberate design choice
        // over blocking the sensor task indefinitely.
      }
    } else {
      Serial.println("[SensorTask] DHT read failed");
    }

    vTaskDelay(xDelay);
    // vTaskDelay() yields the CPU to other tasks for the delay period.
    // A blocking delay() would hog the core and starve every other
    // task at equal or lower priority — including the blink task and
    // the button ISR's servicing task.
  }
}

// =================================================================
// Task B — StatusTask (priority 1)
// Blinks the onboard LED. Speed adjusts if the speed button is held.
// Reads g_latestReading through the mutex purely to prove the pattern
// (e.g. blinks a distinct pattern if temperature > threshold).
// =================================================================
void StatusTask(void *pvParameters) {
  pinMode(STATUS_LED_PIN, OUTPUT);

  for (;;) {
    bool speedHeld = (digitalRead(SPEED_BUTTON_PIN) == LOW);
    int delayMs = speedHeld ? 150 : g_blinkDelayMs;

    float tempSnapshot = NAN;
    if (xSemaphoreTake(g_dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      tempSnapshot = g_latestReading.temperature;
      xSemaphoreGive(g_dataMutex);
    }

    digitalWrite(STATUS_LED_PIN, HIGH);
    vTaskDelay(pdMS_TO_TICKS(delayMs));
    digitalWrite(STATUS_LED_PIN, LOW);
    vTaskDelay(pdMS_TO_TICKS(delayMs));

    if (!isnan(tempSnapshot) && tempSnapshot > 30.0) {
      Serial.println("[StatusTask] temp above threshold (read via mutex)");
    }
  }
}

// =================================================================
// Task C — NetworkTask (priority 1)
// Consumer: pulls readings off the queue, connects WiFi/MQTT lazily,
// and publishes JSON. Also services the emergency flag set by the ISR
// — this is where the *real* work for the interrupt happens, not in
// the ISR itself.
// =================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[NetworkTask] connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    vTaskDelay(pdMS_TO_TICKS(500));
    Serial.print(".");
    attempts++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " FAILED");
}

void connectMQTT() {
  if (mqttClient.connected()) return;
  Serial.print("[NetworkTask] connecting to MQTT broker...");
  if (mqttClient.connect(MQTT_CLIENT_ID)) {
    Serial.println(" connected");
  } else {
    Serial.printf(" failed, rc=%d\n", mqttClient.state());
  }
}

void publishReading(const QueueItem &item) {
  char payload[160];
  snprintf(payload, sizeof(payload),
    "{\"temp\":%.1f,\"humidity\":%.1f,\"emergency\":%s,\"ts\":%lu}",
    item.temperature, item.humidity,
    item.isEmergency ? "true" : "false",
    (unsigned long)(millis() / 1000));

  mqttClient.publish(MQTT_TOPIC, payload);
  Serial.print("[NetworkTask] published: ");
  Serial.println(payload);
}

void NetworkTask(void *pvParameters) {
  connectWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  QueueItem item;

  for (;;) {
    // Service the ISR flag here — NOT in the ISR itself.
    bool emergency = false;
    portENTER_CRITICAL(&g_isrMux);
    if (g_emergencyFlagISR) {
      emergency = true;
      g_emergencyFlagISR = false;
    }
    portEXIT_CRITICAL(&g_isrMux);

    if (emergency) {
      float tSnap = NAN, hSnap = NAN;
      if (xSemaphoreTake(g_dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        tSnap = g_latestReading.temperature;
        hSnap = g_latestReading.humidity;
        xSemaphoreGive(g_dataMutex);
      }
      QueueItem urgent = { tSnap, hSnap, true };
      // Send to the FRONT of the queue so it's published before any
      // reading that's already queued and waiting.
      xQueueSendToFront(g_readingQueue, &urgent, 0);
      Serial.println("[NetworkTask] emergency event queued to front");
    }

    if (xQueueReceive(g_readingQueue, &item, pdMS_TO_TICKS(500)) == pdTRUE) {
      if (WiFi.status() != WL_CONNECTED) connectWiFi();
      connectMQTT();
      mqttClient.loop();
      publishReading(item);
    }

    mqttClient.loop();
  }
}

// =================================================================
// setup() / loop()
// setup() only creates resources and tasks, then loop() is left
// almost empty — all real work happens inside FreeRTOS tasks.
// =================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] Simulated IoT Environmental Monitor starting...");

  dht.begin();
  pinMode(SPEED_BUTTON_PIN, INPUT_PULLUP);
  pinMode(EMERGENCY_BTN_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(EMERGENCY_BTN_PIN),
                   onEmergencyButtonPress, FALLING);

  g_dataMutex = xSemaphoreCreateMutex();
  g_readingQueue = xQueueCreate(QUEUE_LENGTH, sizeof(QueueItem));

  g_latestReading = { 0.0f, 0.0f, 0 };

  // Priorities: SensorTask(2) > StatusTask(1) == NetworkTask(1)
  // Stack sizes kept modest — this is a good place to profile with
  // uxTaskGetStackHighWaterMark() if you want to right-size them later.
  xTaskCreate(SensorTask,  "SensorTask",  4096, NULL, 2, NULL);
  xTaskCreate(StatusTask,  "StatusTask",  2048, NULL, 1, NULL);
  xTaskCreate(NetworkTask, "NetworkTask", 6144, NULL, 1, NULL);

  Serial.println("[boot] tasks created, scheduler running");

  // --- Power-awareness note (Day 7 — token gesture, documented intent) ---
  // Wokwi cannot meaningfully simulate current draw, so this is left as
  // a design note rather than working code:
  //   - Wrap SensorTask's vTaskDelay(2000ms) with esp_light_sleep_start()
  //     between reads instead of a busy-scheduled delay, so the CPU
  //     actually powers down between samples instead of just yielding.
  //   - Move from a 2s poll to interrupt-only wake for the emergency
  //     button path (already true here) plus a much longer sensor
  //     interval (e.g. 60s) for the routine path, trading responsiveness
  //     for battery life — the right tradeoff for a coin-cell deployment.
  //   - Batch multiple readings into a single MQTT publish to amortize
  //     the fixed energy cost of bringing the radio out of sleep.
}

void loop() {
  // Intentionally empty — the scheduler runs SensorTask, StatusTask,
  // and NetworkTask independently. Arduino's default loop task is left
  // idle at the lowest priority.
  vTaskDelay(pdMS_TO_TICKS(1000));
}
