import { useState, useEffect } from 'react';
import { SentimentChart } from './SentimentChart';
import { CustomBarChart } from './BarChart';
import { LoadingSpinner } from './LoadingSpinner';

interface SentimentDataPoint { date: string; score: number; }
interface AggregatedSentiment { label: string | number; average_score: number; }

type ChartType = 'time' | 'weekday' | 'month';

export const SentimentAnalysis = () => {
  const [chartType, setChartType] = useState<ChartType>('time');
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    let endpoint = '';
    if (chartType === 'time') endpoint = '/api/analysis/sentiment';
    if (chartType === 'weekday') endpoint = '/api/analysis/sentiment/weekday';
    if (chartType === 'month') endpoint = '/api/analysis/sentiment/month';

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
  }, [chartType]); // Re-fetch when chartType changes

  const renderChart = () => {
    if (isLoading) return <LoadingSpinner />;
    if (data.length === 0) return <p>No data available for this view.</p>;

    if (chartType === 'time') {
      return <SentimentChart data={data as SentimentDataPoint[]} />;
    }
    return <CustomBarChart data={data as AggregatedSentiment[]} />;
  };

  return (
    <div>
      <div className="chart-controls">
        <button onClick={() => setChartType('time')}>Over Time</button>
        <button onClick={() => setChartType('weekday')}>By Day of Week</button>
        <button onClick={() => setChartType('month')}>By Month</button>
      </div>
      {renderChart()}
    </div>
  );
};