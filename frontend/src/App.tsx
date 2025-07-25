import { useState, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import './App.css';
import { SentimentChart } from './SentimentChart';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';

// --- Interfaces for our data shapes ---
interface JournalEntry { id: number; entry_date: string; content: string; }
interface SentimentDataPoint { date: string; score: number; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

function App() {
  // --- State variables ---
  const [importMessage, setImportMessage] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentDataPoint[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);

  // --- Data fetching ---
  const fetchAllData = async () => {
    try {
        const [entriesRes, sentimentRes, topicsRes, nerRes] = await Promise.all([
            fetch('http://localhost:8000/api/entries'),
            fetch('http://localhost:8000/api/analysis/sentiment'),
            fetch('http://localhost:8000/api/analysis/topics'),
            fetch('http://localhost:8000/api/analysis/ner')
        ]);
        const [entriesData, sentimentData, topicsData, nerData] = await Promise.all([
            entriesRes.json(), sentimentRes.json(), topicsRes.json(), nerRes.json()
        ]);
        setEntries(entriesData);
        setFilteredEntries(entriesData); // Initially, filtered list is the full list
        setSentimentData(sentimentData);
        setTopicData(topicsData);
        setNerData(nerData);
    } catch (error) { console.error("Failed to fetch data:", error); }
  };

  useEffect(() => { fetchAllData(); }, []);

  const handleImport = async () => {
    setImportMessage('Importing...');
    try {
        const response = await fetch('http://localhost:8000/api/import', { method: 'POST' });
        const data = await response.json();
        setImportMessage(data.message);
        await fetchAllData();
    } catch (error) { const msg = error instanceof Error ? error.message : 'Unknown error'; setImportMessage(`Error: ${msg}`); }
  };

  // --- Interactivity Logic ---
  const handleEntityClick = (entityText: string) => {
    const filtered = entries.filter(entry => entry.content.includes(entityText));
    setFilteredEntries(filtered);
  };

  const resetFilter = () => {
    setFilteredEntries(entries);
  };
  
  // --- Dashboard Layout Definition ---
  const layout = [
    { i: 'actions', x: 0, y: 0, w: 12, h: 1 },
    { i: 'heatmap', x: 0, y: 1, w: 12, h: 2 },
    { i: 'ner', x: 0, y: 3, w: 12, h: 4 },
    { i: 'connections', x: 0, y: 7, w: 6, h: 4 },
    { i: 'common', x: 6, y: 7, w: 6, h: 4 },
    { i: 'sentimentChart', x: 0, y: 11, w: 12, h: 3 },
    { i: 'topics', x: 0, y: 14, w: 6, h: 4 },
    { i: 'entries', x: 6, y: 14, w: 6, h: 4 },
  ];

  return (
    <div className="App">
      <header className="App-header">
        <h1>Smriti: The Entire History of You</h1>
      </header>

      <GridLayout className="layout" layout={layout} cols={12} rowHeight={100} width={1200}>
        <div key="actions" className="card">
          <h2>Actions</h2>
          <button onClick={handleImport}>Import Journal Entries</button>
          {importMessage && <p><i>{importMessage}</i></p>}
          <button onClick={resetFilter} style={{marginLeft: '1rem'}}>Reset Entry Filter</button>
        </div>
        <div key="heatmap" className="card">
          <h2>Sentiment Heatmap</h2>
          <HeatmapDisplay sentimentData={sentimentData} />
        </div>
        <div key="ner" className="card">
            <NerDisplay nerData={nerData} onEntityClick={handleEntityClick} />
        </div>
        <div key="connections" className="card">
          <h2>Connection Engine</h2>
          <ConnectionEngine nerData={nerData} />
        </div>
        <div key="common" className="card">
          <h2>Common Connection Discovery</h2>
          <CommonConnections nerData={nerData} />
        </div>
        <div key="sentimentChart" className="card">
          <h2>Sentiment Over Time</h2>
          <SentimentChart data={sentimentData} />
        </div>
        <div key="topics" className="card">
          <h2>Discovered Topics</h2>
          {/* (Topic Display Logic) */}
        </div>
        <div key="entries" className="card">
          <h2>Entries ({filteredEntries.length} of {entries.length})</h2>
          <div className="entry-list"> {filteredEntries.map(entry => ( <div key={entry.id} className="entry-item"> <h3>{entry.entry_date}</h3> <p>{entry.content.substring(0, 100)}...</p> </div> ))} </div>
        </div>
      </GridLayout>
    </div>
  );
}

export default App;