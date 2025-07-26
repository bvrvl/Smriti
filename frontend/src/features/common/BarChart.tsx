import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BarData {
  label: string | number;
  average_score: number;
}

interface ChartProps {
  data: BarData[];
}

export const CustomBarChart = ({ data }: ChartProps) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis domain={[-1, 1]} />
        <Tooltip />
        <Legend />
        <Bar dataKey="average_score" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
};