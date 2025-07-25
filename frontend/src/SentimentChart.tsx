import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Defines the shape of the data this component expects.
interface SentimentData {
  date: string; // The full ISO datetime string, e.g., "2025-07-25T13:19:00"
  score: number;
}

interface ChartProps {
  data: SentimentData[];
}

export const SentimentChart = ({ data }: ChartProps) => {
  // Before rendering, we format the date to be more readable on the chart's X-axis.
  const formattedData = data.map(d => ({
    ...d,
    date: d.date.substring(0, 10), // Extracts just the "YYYY-MM-DD" part
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={formattedData} // Use the formatted data
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[-1, 1]} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="score" stroke="#8884d8" activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};