import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const MAX_POINTS = 60;

function formatClock(ts) {
  if (!ts) return "--:--:--";
  return new Date(ts * 1000 > Date.now() ? ts : ts * 1000).toLocaleTimeString();
}

function relativeTime(ms) {
  if (!ms) return "never";
  const diff = Math.round((Date.now() - ms) / 1000);
  if (diff < 2) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export default function App() {
  const [readings, setReadings] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastReceivedAt, setLastReceivedAt] = useState(null);
  const [log, setLog] = useState([]);
  const consoleRef = useRef(null);

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ["websocket"] });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("history", (history) => {
      setReadings(history.slice(-MAX_POINTS));
    });

    socket.on("reading", (reading) => {
      setLastReceivedAt(Date.now());
      setReadings((prev) => [...prev.slice(-(MAX_POINTS - 1)), reading]);

      const source = reading.emergency ? "EmergencyISR" : "NetworkTask";
      setLog((prev) => [
        ...prev.slice(-99),
        {
          id: `${reading.receivedAt}-${Math.random()}`,
          tag: source,
          text: `temp=${reading.temp?.toFixed?.(1)}C humidity=${reading.humidity?.toFixed?.(1)}% ${
            reading.emergency ? "[EMERGENCY]" : ""
          }`,
          ts: reading.receivedAt,
        },
      ]);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [log]);

  const latest = readings[readings.length - 1];
  const hasEmergency = latest?.emergency;

  const chartData = useMemo(
    () =>
      readings.map((r, i) => ({
        idx: i,
        label: formatClock(r.ts),
        temp: r.temp,
        humidity: r.humidity,
      })),
    [readings]
  );

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Environmental Monitor</h1>
          <div className="subtitle">ESP32 · FreeRTOS · MQTT → Node/Express → React</div>
        </div>
        <div className={`status-pill`}>
          <span className={`dot ${hasEmergency ? "alert" : connected ? "online" : ""}`} />
          {connected ? (hasEmergency ? "emergency event" : "live") : "disconnected"}
        </div>
      </header>

      <section className="readings-row">
        <div className="card temp">
          <div className="label">Temperature</div>
          <div className="value">
            {latest ? latest.temp?.toFixed(1) : "--"}
            <span className="unit">°C</span>
          </div>
        </div>
        <div className="card humidity">
          <div className="label">Humidity</div>
          <div className="value">
            {latest ? latest.humidity?.toFixed(1) : "--"}
            <span className="unit">%RH</span>
          </div>
        </div>
        <div className="card updated">
          <div className="label">Last Reading</div>
          <div className="value">{relativeTime(lastReceivedAt)}</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <span>
            <span className="legend-dot" style={{ background: "var(--signal-temp)" }} />
            temperature
            <span style={{ marginLeft: 16 }} />
            <span className="legend-dot" style={{ background: "var(--signal-humidity)" }} />
            humidity
          </span>
          <span>last {chartData.length} readings</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#1f2933" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7c8a99" }} minTickGap={30} />
            <YAxis tick={{ fontSize: 10, fill: "#7c8a99" }} />
            <Tooltip
              contentStyle={{
                background: "#121821",
                border: "1px solid #1f2933",
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="temp" stroke="#4ce0b3" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="humidity" stroke="#5b9eff" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="console">
        <div className="console-header">
          <span>serial monitor — network task log</span>
          <span>{log.length} lines</span>
        </div>
        <div className="console-body" ref={consoleRef}>
          {log.length === 0 && (
            <div className="console-empty">
              waiting for the first MQTT publish from NetworkTask... (run the Wokwi
              simulation, or POST /api/simulate to test without hardware)
            </div>
          )}
          {log.map((line) => (
            <div className="console-line" key={line.id}>
              <span className="ts">{new Date(line.ts).toLocaleTimeString()}</span>
              <span className={`tag ${line.emergency ? "emergency" : "network"}`}>
                [{line.tag}]
              </span>{" "}
              {line.text}
            </div>
          ))}
        </div>
      </section>

      <div className="footer-note">
        backend: {BACKEND_URL} · {connected ? "socket connected" : "socket offline"}
      </div>
    </div>
  );
}
