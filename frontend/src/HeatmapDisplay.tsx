import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';

interface SentimentDataPoint { date: string; score: number; }
interface HeatmapProps { sentimentData: SentimentDataPoint[]; }

export const HeatmapDisplay = ({ sentimentData }: HeatmapProps) => {
    if (!sentimentData || sentimentData.length === 0) {
        return <p>No sentiment data available for the heatmap.</p>;
    }

    const heatmapValues = sentimentData.map(d => ({
        date: new Date(d.date),
        count: d.score + 1,
    }));
    
    const allYears = Array.from(new Set(heatmapValues.map(v => v.date.getFullYear()))).sort();
    const startYear = allYears[0];
    const endYear = allYears[allYears.length - 1];
    
    const yearsToRender = [];
    for (let year = startYear; year <= endYear; year++) {
        yearsToRender.push(year);
    }

    return (
        <div className="heatmap-container">
            {yearsToRender.map(year => (
                <div key={year}>
                    <h3>{year}</h3>
                    <CalendarHeatmap
                        startDate={new Date(`${year}-01-01`)}
                        endDate={new Date(`${year}-12-31`)}
                        values={heatmapValues}
                        classForValue={(value) => {
                            if (!value) { return 'color-empty'; }
                            const score = value.count - 1;
                            if (score > 0.5) return 'color-scale-4';
                            if (score > 0.1) return 'color-scale-3';
                            if (score > -0.1) return 'color-scale-2';
                            if (score > -0.5) return 'color-scale-1';
                            return 'color-scale-0';
                        }}
                    />
                </div>
            ))}
        </div>
    );
};