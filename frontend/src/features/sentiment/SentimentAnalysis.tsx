import { useState, useEffect } from 'react';
import { SentimentChart } from '../common/SentimentChart';
import { CustomBarChart } from '../common/BarChart';
import { LoadingSpinner } from '../../components/LoadingSpinner';

// Define the shape of our data for different chart types
interface SentimentDataPoint { date: string; score: number; }
interface AggregatedSentiment { label: string | number; average_score: number; }

// Define the possible chart views the user can select
type ChartType = 'time' | 'weekday' | 'month' | 'hour';

export const SentimentAnalysis = () => {
  // State to track which chart the user wants to see
  const [chartType, setChartType] = useState<ChartType>('time');
  // State to hold the data for the currently selected chart
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // This effect re-runs whenever the user clicks a button to change the chartType
  useEffect(() => {
    setIsLoading(true);
    let endpoint = '';
    if (chartType === 'time') endpoint = '/api/analysis/sentiment';
    if (chartType === 'weekday') endpoint = '/api/analysis/sentiment/weekday';
    if (chartType === 'month') endpoint = '/api/analysis/sentiment/month';
    if (chartType === 'hour') endpoint = '/api/analysis/sentiment/hour';

    fetch(`http://localhost:8000${endpoint}`)
      .then(res => res.json())
      .then(fetchedData => {
        setData(fetchedData);
        setIsLoading(false);
      })
      .catch(error => {
        console.error(`Failed to fetch ${chartType} data`, error);
        setIsLoading(false);
      });
  }, [chartType]);

  // Helper function to render the correct chart based on the current state
  const renderChart = () => {
    if (isLoading) return <LoadingSpinner />;
    if (data.length === 0) return <p>No data available for this view.</p>;

    // The 'time' chart uses a line graph
    if (chartType === 'time') {
      return <SentimentChart data={data as SentimentDataPoint[]} />;
    }
    // All other aggregated views use a bar chart
    return <CustomBarChart data={data as AggregatedSentiment[]} />;
  };

  return (
    <div>
      <div className="chart-controls">
        <button onClick={() => setChartType('time')}>Over Time</button>
        <button onClick={() => setChartType('weekday')}>By Day of Week</button>
        <button onClick={() => setChartType('month')}>By Month</button>
        <button onClick={() => setChartType('hour')}>By Hour of Day</button>
      </div>
      <div className="chart-container">
        {renderChart()}
      </div>
    </div>
  );
};