import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
const MAX_LOG_LINES = 80;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, color, icon }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid var(--border)`,
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      minWidth: '140px',
      flex: 1,
    }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon} {label}
      </span>
      <span style={{ fontSize: '2rem', fontWeight: 700, color }}>
        {value !== null && value !== undefined ? value : '—'}
        <span style={{ fontSize: '1rem', fontWeight: 400, marginLeft: '0.25rem', color: 'var(--text-muted)' }}>
          {unit}
        </span>
      </span>
    </div>
  );
}

// ─── Emergency badge ─────────────────────────────────────────────────────────
function EmergencyBadge({ active }) {
  return (
    <div style={{
      background: active ? '#7f1d1d' : 'var(--surface)',
      border: `1px solid ${active ? 'var(--accent-red)' : 'var(--border)'}`,
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      minWidth: '140px',
      flex: 1,
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        🚨 Emergency
      </span>
      <span style={{
        fontSize: '1.4rem',
        fontWeight: 700,
        color: active ? 'var(--accent-red)' : 'var(--text-muted)',
      }}>
        {active ? 'TRIGGERED' : 'Normal'}
      </span>
    </div>
  );
}

// ─── Connection pill ─────────────────────────────────────────────────────────
function ConnPill({ connected }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4rem',
      fontSize: '0.8rem',
      padding: '0.2rem 0.75rem',
      borderRadius: '999px',
      background: connected ? '#14532d' : '#450a0a',
      color: connected ? '#86efac' : '#fca5a5',
      border: `1px solid ${connected ? '#166534' : '#7f1d1d'}`,
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: connected ? '#22c55e' : '#ef4444',
        display: 'inline-block',
      }} />
      {connected ? 'Connected' : 'Disconnected'}
    </span>
  );
}

// ─── Custom tooltip for the chart ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e2130',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '0.6rem 1rem',
      fontSize: '0.85rem',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected] = useState(false);
  const [readings, setReadings] = useState([]);   // full history for chart
  const [latest, setLatest] = useState(null);      // most recent reading
  const [logs, setLogs] = useState([]);            // serial-monitor style log
  const logEndRef = useRef(null);

  // auto-scroll serial log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const socket = io(BACKEND_URL);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Full history on first connect
    socket.on('history', (data) => {
      if (!Array.isArray(data)) return;
      setReadings(data);
      if (data.length) setLatest(data[data.length - 1]);
      const lines = data.map((r) =>
        `[${fmtFull(r.ts)}]  temp=${r.temp}°C  hum=${r.humidity}%  emergency=${r.emergency}`
      );
      setLogs(lines.slice(-MAX_LOG_LINES));
    });

    // Live readings
    socket.on('reading', (r) => {
      setLatest(r);
      setReadings((prev) => {
        const next = [...prev, r];
        return next.length > 100 ? next.slice(-100) : next;
      });
      setLogs((prev) => {
        const line = `[${fmtFull(r.ts)}]  temp=${r.temp}°C  hum=${r.humidity}%  emergency=${r.emergency}${r.emergency ? '  ⚠ EMERGENCY' : ''}`;
        const next = [...prev, line];
        return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
      });
    });

    return () => socket.disconnect();
  }, []);

  // Chart data — format timestamp for X axis
  const chartData = readings.map((r) => ({
    ...r,
    time: fmtTime(r.ts),
  }));

  return (
    <div>
      {/* ── Header ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.75rem',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.2 }}>
            🌡 IoT Environmental Monitor
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            FreeRTOS on ESP32 (Wokwi) → MQTT → Node/Express → React
          </p>
        </div>
        <ConnPill connected={connected} />
      </header>

      {/* ── Stat cards ── */}
      <section style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
        <StatCard
          label="Temperature"
          value={latest?.temp?.toFixed(1)}
          unit="°C"
          color="var(--accent-blue)"
          icon="🌡"
        />
        <StatCard
          label="Humidity"
          value={latest?.humidity?.toFixed(1)}
          unit="%"
          color="var(--accent-teal)"
          icon="💧"
        />
        <StatCard
          label="Last update"
          value={fmtFull(latest?.ts)}
          unit=""
          color="var(--text-primary)"
          icon="🕒"
        />
        <EmergencyBadge active={latest?.emergency === true} />
      </section>

      {/* ── Live chart ── */}
      <section style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.25rem',
        marginBottom: '1.75rem',
      }}>
        <h2 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live sensor history (last {readings.length} readings)
        </h2>
        {readings.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
            Waiting for readings… start the Wokwi simulation or POST to /api/simulate
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#64748b', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="temp"
                domain={['auto', 'auto']}
                tick={{ fill: '#64748b', fontSize: 11 }}
                unit="°C"
              />
              <YAxis
                yAxisId="hum"
                orientation="right"
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                unit="%"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temp"
                name="Temp (°C)"
                stroke="var(--accent-blue)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="hum"
                type="monotone"
                dataKey="humidity"
                name="Humidity (%)"
                stroke="var(--accent-teal)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ── Serial monitor log ── */}
      <section style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.25rem',
      }}>
        <h2 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Serial monitor
        </h2>
        <div style={{
          background: '#0b0e14',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          height: '220px',
          overflowY: 'auto',
          fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
          fontSize: '0.78rem',
          lineHeight: 1.7,
        }}>
          {logs.length === 0 ? (
            <span style={{ color: '#475569' }}>No data yet…</span>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('EMERGENCY') ? 'var(--accent-red)' : '#94a3b8',
                  whiteSpace: 'pre',
                }}
              >
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  );
}
