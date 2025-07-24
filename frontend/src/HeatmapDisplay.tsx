// /frontend/src/HeatmapDisplay.tsx
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';

interface SentimentDataPoint {
  date: string;
  score: number;
}

interface HeatmapProps {
  sentimentData: SentimentDataPoint[];
}

export const HeatmapDisplay = ({ sentimentData }: HeatmapProps) => {
  const today = new Date();
  
  const heatmapValues = sentimentData.map(d => ({
    date: d.date,
    // The heatmap 'count' will be our sentiment score, shifted to a 0-2 scale for coloring
    count: d.score + 1, 
  }));

  return (
    <div className="heatmap-container">
      <CalendarHeatmap
        startDate={new Date(today.getFullYear(), 0, 0)}
        endDate={today}
        values={heatmapValues}
        classForValue={(value) => {
          if (!value) {
            return 'color-empty';
          }
          // Maps score to a CSS color class
          const score = value.count - 1; // shift back to -1 to 1
          if (score > 0.5) return 'color-scale-4'; // Very Positive
          if (score > 0.1) return 'color-scale-3'; // Positive
          if (score > -0.1) return 'color-scale-2'; // Neutral
          if (score > -0.5) return 'color-scale-1'; // Negative
          return 'color-scale-0'; // Very Negative
        }}
      />
    </div>
  );
};