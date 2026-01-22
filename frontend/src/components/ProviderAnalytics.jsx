import React, { useState, useEffect } from "react";
import api from "../services/auth"; // Your axios instance
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  Users,
  Calendar,
  DollarSign,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import "./ProviderAnalytics.css";

const ProviderAnalytics = () => {
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 🔄 RENAMED ROUTES to avoid ad-blockers blocking "analytics"
        const [summaryRes, trendsRes] = await Promise.all([
          api.get("/insights/summary"),
          api.get("/insights/trends"),
        ]);
        setSummary(summaryRes.data);
        setTrends(trendsRes.data);
      } catch (error) {
        console.error("Error loading insights:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading)
    return (
      <div className="analytics-loading">Loading business insights...</div>
    );
  if (!summary)
    return <div className="analytics-error">Could not load data.</div>;

  return (
    <div className="analytics-container">
      <h2 className="analytics-title">Business Overview</h2>

      {/* 1. KEY METRICS CARDS */}
      <div className="stats-grid">
        <StatCard
          icon={<DollarSign />}
          title="Net Earnings"
          value={`KES ${summary.net_earnings?.toLocaleString()}`}
          sub={`Gross: KES ${summary.total_earnings?.toLocaleString()}`}
          color="green"
        />
        <StatCard
          icon={<Calendar />}
          title="Total Appointments"
          value={summary.total_appointments}
          sub={`${summary.completed} Completed`}
          color="blue"
        />
        <StatCard
          icon={<Users />}
          title="Unique Clients"
          value={summary.unique_clients}
          color="purple"
        />
        <StatCard
          icon={<Briefcase />}
          title="Active Services"
          value={summary.total_services}
          color="orange"
        />
      </div>

      {/* 2. SECONDARY METRICS */}
      <div className="secondary-stats">
        <div className="mini-stat">
          <CheckCircle size={16} className="text-green" />
          <span>
            Completion Rate:{" "}
            <strong>
              {Math.round(
                (summary.completed / summary.total_appointments) * 100
              ) || 0}
              %
            </strong>
          </span>
        </div>
        <div className="mini-stat">
          <XCircle size={16} className="text-red" />
          <span>
            Cancelled: <strong>{summary.cancelled}</strong>
          </span>
        </div>
        <div className="mini-stat">
          <AlertTriangle size={16} className="text-orange" />
          <span>
            No-Shows: <strong>{summary.no_shows}</strong>
          </span>
        </div>
        <div className="mini-stat">
          <DollarSign size={16} className="text-gray" />
          <span>
            Refunds Processed:{" "}
            <strong>KES {summary.total_refunds?.toLocaleString()}</strong>
          </span>
        </div>
      </div>

      {/* 3. CHARTS SECTION */}
      <div className="charts-section">
        {/* Monthly Revenue Chart */}
        <div className="chart-card">
          <h3>Monthly Revenue</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [
                    `KES ${value.toLocaleString()}`,
                    "Revenue",
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar dataKey="revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Appointment Trends */}
        <div className="chart-card">
          <h3>Booking Volume</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Component for Cards
const StatCard = ({ icon, title, value, sub, color }) => (
  <div className={`stat-card ${color}`}>
    <div className="stat-icon-wrapper">{icon}</div>
    <div className="stat-content">
      <p className="stat-title">{title}</p>
      <h3 className="stat-value">{value}</h3>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  </div>
);

export default ProviderAnalytics;