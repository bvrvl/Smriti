import { useState, useEffect } from 'react';

import './App.css';
import { SentimentChart } from './SentimentChart';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';
import { OnThisDay } from './OnThisDay';
import { LoadingSpinner } from './LoadingSpinner';

// --- Type Definitions ---
interface JournalEntry {
  id: number;
  entry_date: string;
  content: string;
}
interface SentimentDataPoint {
  date: string;
  score: number;
}
interface Topic {
  topic_id: number;
  keywords: string[];
}
interface EntityCount {
  text: string;
  count: number;
}
interface NerData {
  people: EntityCount[];
  places: EntityCount[];
  orgs: EntityCount[];
}

function App() {
  // --- State Management ---
  // We use an object for loading state to track each API call individually.
  // This allows us to show spinners on a per-card basis.
  const [isLoading, setIsLoading] = useState({
    entries: true,
    sentiment: true,
    topics: true,
    ner: true,
  });

  const [importMessage, setImportMessage] = useState('');

  // State variables for all the data we fetch from the backend.
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentDataPoint[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  
  // A separate state for the filtered list of entries, used for interactivity.
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);


  // --- Data Fetching ---
  // This function fetches all the core data for the dashboard.
  const fetchAllData = () => {
    // Set all loading states to true before starting the fetches.
    setIsLoading({ entries: true, sentiment: true, topics: true, ner: true });

    // We fetch each piece of data independently. When each fetch completes,
    // it updates its own data state and sets its corresponding loading flag to false.
    fetch('http://localhost:8000/api/entries').then(res => res.json())
      .then(data => {
        setEntries(data);
        setFilteredEntries(data); // Initially, the filtered list is the full list.
      })
      .catch(e => console.error("Failed to fetch entries", e))
      .finally(() => setIsLoading(prev => ({ ...prev, entries: false })));

    fetch('http://localhost:8000/api/analysis/sentiment').then(res => res.json())
      .then(data => setSentimentData(data))
      .catch(e => console.error("Failed to fetch sentiment", e))
      .finally(() => setIsLoading(prev => ({ ...prev, sentiment: false })));

    fetch('http://localhost:8000/api/analysis/topics').then(res => res.json())
      .then(data => setTopicData(data))
      .catch(e => console.error("Failed to fetch topics", e))
      .finally(() => setIsLoading(prev => ({ ...prev, topics: false })));

    fetch('http://localhost:8000/api/analysis/ner').then(res => res.json())
      .then(data => setNerData(data))
      .catch(e => console.error("Failed to fetch NER data", e))
      .finally(() => setIsLoading(prev => ({ ...prev, ner: false })));
  };

  // The `useEffect` hook with an empty dependency array `[]` ensures this
  // code runs only once, when the App component is first mounted to the screen.
  useEffect(() => {
    fetchAllData();
  }, []);

  // --- User Actions ---
  // This function is triggered when the user clicks the 'Import' button.
  const handleImport = () => {
    setImportMessage('Importing...');
    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setImportMessage(data.message);
        // After a successful import, we must re-fetch all data to update the dashboard.
        fetchAllData();
      })
      .catch(error => {
        console.error("Import failed:", error);
        setImportMessage('An error occurred during import.');
      });
  };

  // This function filters the main entry list based on a clicked entity.
  const handleEntityClick = (entityText: string) => {
    const filtered = entries.filter(entry => entry.content.includes(entityText));
    setFilteredEntries(filtered);
  };
  
  // This function resets the entry list back to its original, unfiltered state.
  const resetFilter = () => {
    setFilteredEntries(entries);
  };

  // --- Render Logic ---
  return (
    <div className="App">
      <header className="App-header">
        <h1>Smriti: The Entire History of You</h1>
      </header>

      {/* This top-level card is always visible and contains the main user actions. */}
      <div className="card grid-col-span-12">
        <div className="actions-card-content">
          <button onClick={handleImport}>Import Journal Entries</button>
          <button onClick={resetFilter}>Reset Entry Filter</button>
          {importMessage && <p><i>{importMessage}</i></p>}
        </div>
      </div>
      
      {/* The main dashboard grid */}
      <div className="dashboard-container">
        <div className="card grid-col-span-12">
          <h2>On This Day in Your History</h2>
          <OnThisDay />
        </div>

        <div className="card grid-col-span-12">
          <h2>Sentiment Heatmap</h2>
          {/* We show a spinner while data is loading, then the component once it's ready. */}
          {isLoading.sentiment ? <LoadingSpinner /> : <HeatmapDisplay sentimentData={sentimentData} />}
        </div>

        <div className="card grid-col-span-12">
          {isLoading.ner ? <LoadingSpinner /> : <NerDisplay nerData={nerData} onEntityClick={handleEntityClick} />}
        </div>
        
        <div className="card grid-col-span-6">
          <h2>Connection Engine</h2>
          {/* This component depends on NER data, so we use the NER loading state. */}
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