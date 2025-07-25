// This is the main component that orchestrates the entire application dashboard.
import { useState, useEffect } from 'react';

// Import custom components and styles
import './App.css';
import { SentimentChart } from './SentimentChart';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';
import { OnThisDay } from './OnThisDay';
import { LoadingSpinner } from './LoadingSpinner';

// --- Type Definitions for API data ---
interface JournalEntry { id: number; entry_date: string; content: string; tags: string | null; }
interface SentimentDataPoint { date: string; score: number; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

function App() {
  // --- State Management ---
  // A single object to track the loading state of each data type individually.
  const [isLoading, setIsLoading] = useState({
    entries: true,
    sentiment: true,
    topics: true,
    ner: true,
    onThisDay: true,
  });

  const [importMessage, setImportMessage] = useState('');
  
  // State variables for all data fetched from the backend.
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentDataPoint[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  const [onThisDayData, setOnThisDayData] = useState<JournalEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);

  // --- Data Fetching ---
  const fetchAllData = () => {
    // Set all loading states to true before fetching.
    setIsLoading({ entries: true, sentiment: true, topics: true, ner: true, onThisDay: true });

    // Use Promise.all to fetch all data in parallel for efficiency.
    Promise.all([
      fetch('http://localhost:8000/api/entries'),
      fetch('http://localhost:8000/api/analysis/sentiment'),
      fetch('http://localhost:8000/api/analysis/topics'),
      fetch('http://localhost:8000/api/analysis/ner'),
      fetch('http://localhost:8000/api/on-this-day')
    ]).then(async ([entriesRes, sentimentRes, topicsRes, nerRes, onThisDayRes]) => {
      // Once all fetches are complete, parse the JSON from their responses.
      const entriesData = await entriesRes.json();
      const sentimentData = await sentimentRes.json();
      const topicsData = await topicsRes.json();
      const nerData = await nerRes.json();
      const onThisDayData = await onThisDayRes.json();

      // Set all state variables at once to trigger a single re-render.
      setEntries(entriesData);
      setFilteredEntries(entriesData);
      setSentimentData(sentimentData);
      setTopicData(topicsData);
      setNerData(nerData);
      setOnThisDayData(onThisDayData);
    }).catch(error => {
      console.error("Failed to fetch initial data:", error);
    }).finally(() => {
      // Once everything is done (success or fail), turn off all loading spinners.
      setIsLoading({ entries: false, sentiment: false, topics: false, ner: false, onThisDay: false });
    });
  };

  // This `useEffect` runs only once when the component first loads.
  useEffect(() => {
    fetchAllData();
  }, []);

  // --- User Actions ---
  const handleImport = () => {
    setImportMessage('Importing...');
    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setImportMessage(data.message);
        fetchAllData(); // Re-fetch all data after a successful import.
      })
      .catch(error => {
        console.error("Import failed:", error);
        setImportMessage('An error occurred during import.');
      });
  };

  const handleEntityClick = (entityText: string) => {
    const filtered = entries.filter(entry => entry.content.includes(entityText));
    setFilteredEntries(filtered);
  };
  
  const resetFilter = () => {
    setFilteredEntries(entries);
  };

  // --- Render Logic ---
  return (
    <div className="App">
      <header className="App-header">
        <h1>Smriti: The Entire History of You</h1>
      </header>

      <div className="card grid-col-span-12">
        <div className="actions-card-content">
          <button onClick={handleImport}>Import Journal Entries</button>
          <button onClick={resetFilter}>Reset Entry Filter</button>
          {importMessage && <p><i>{importMessage}</i></p>}
        </div>
      </div>
      
      <div className="dashboard-container">
        <div className="card grid-col-span-12">
          <h2>On This Day in Your History</h2>
          <OnThisDay entries={onThisDayData} isLoading={isLoading.onThisDay} />
        </div>

        <div className="card grid-col-span-12">
          <h2>Sentiment Heatmap</h2>
          {isLoading.sentiment ? <LoadingSpinner /> : <HeatmapDisplay sentimentData={sentimentData} />}
        </div>

        <div className="card grid-col-span-12">
          {isLoading.ner ? <LoadingSpinner /> : <NerDisplay nerData={nerData} onEntityClick={handleEntityClick} />}
        </div>
        
        <div className="card grid-col-span-6">
          <h2>Connection Engine</h2>
          {isLoading.ner ? <LoadingSpinner /> : <ConnectionEngine nerData={nerData} />}
        </div>

        <div className="card grid-col-span-6">
          <h2>Common Connection Discovery</h2>
          {isLoading.ner ? <LoadingSpinner /> : <CommonConnections nerData={nerData} />}
        </div>

        <div className="card grid-col-span-12">
          <h2>Sentiment Over Time</h2>
          {isLoading.sentiment ? <LoadingSpinner /> : <SentimentChart data={sentimentData} />}
        </div>

        <div className="card grid-col-span-6">
          <h2>Discovered Topics</h2>
          {isLoading.topics ? <LoadingSpinner /> : (
            <ul className="topics-list">
              {topicData.length > 0 ? topicData.map(topic => (
                <li key={topic.topic_id}>
                  <strong>Topic {topic.topic_id + 1}:</strong> {topic.keywords.join(', ')}
                </li>
              )) : <p><i>No topics found. (Requires at least 5 entries).</i></p>}
            </ul>
          )}
        </div>

        <div className="card grid-col-span-6">
          <h2>Entries ({filteredEntries.length} of {entries.length})</h2>
          {isLoading.entries ? <LoadingSpinner /> : (
            <div className="entry-list">
              {filteredEntries.map(entry => (
                <div key={entry.id} className="entry-item">
                  <h3>{entry.entry_date}</h3>
                  <p>{entry.content.substring(0, 100)}...</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;