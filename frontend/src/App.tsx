import { useState, useEffect, useRef } from 'react';

// Import custom components and styles
import './App.css';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';
import { OnThisDay } from './OnThisDay';
import { LoadingSpinner } from './LoadingSpinner';
import { SentimentAnalysis } from './SentimentAnalysis';
import { SearchResults } from './SearchResults';

// --- Type Definitions for API data ---
interface JournalEntry { id: number; entry_date: string; content: string; tags: string | null; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

function App() {
  // --- State Management ---
  const [isLoading, setIsLoading] = useState({
    entries: true,
    topics: true,
    ner: true,
    onThisDay: true,
    sentiment: true,
  });

  const [importMessage, setImportMessage] = useState('');
  
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  const [onThisDayData, setOnThisDayData] = useState<JournalEntry[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<JournalEntry[] | null>(null);

  // A ref to hold the polling interval so we can clear it.
  const pollingIntervalRef = useRef<number | null>(null);
  
  // --- Data Fetching ---
  const fetchAllData = async () => {
    // We don't set loading to true here, as individual fetches will handle it.
    const responses = await Promise.allSettled([
      fetch('http://localhost:8000/api/entries'),
      fetch('http://localhost:8000/api/analysis/topics'),
      fetch('http://localhost:8000/api/analysis/ner'),
      fetch('http://localhost:8000/api/on-this-day'),
      fetch('http://localhost:8000/api/analysis/sentiment')
    ]);

    if (responses[0].status === 'fulfilled' && responses[0].value.ok) {
      const data = await responses[0].value.json();
      setEntries(data);
      setFilteredEntries(data);
    }
    if (responses[1].status === 'fulfilled' && responses[1].value.ok) {
      setTopicData(await responses[1].value.json());
    }
    if (responses[2].status === 'fulfilled' && responses[2].value.ok) {
      setNerData(await responses[2].value.json());
    }
    if (responses[3].status === 'fulfilled' && responses[3].value.ok) {
      setOnThisDayData(await responses[3].value.json());
    }
    if (responses[4].status === 'fulfilled' && responses[4].value.ok) {
      setSentimentData(await responses[4].value.json());
    }
    setIsLoading({ entries: false, topics: false, ner: false, onThisDay: false, sentiment: false });
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // --- User Actions ---
  const checkImportStatus = () => {
    fetch('http://localhost:8000/api/import/status')
      .then(res => res.json())
      .then(status => {
        if (status.status === 'processing') {
          setImportMessage(`Embedding entries... (${status.progress} / ${status.total})`);
        } else {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          setImportMessage('Embedding complete! Refreshing dashboard...');
          fetchAllData();
        }
      });
  };

  const handleImport = () => {
    setImportMessage('Importing files...');
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setImportMessage(data.message);
        // Begin polling the status endpoint every 2 seconds.
        pollingIntervalRef.current = setInterval(checkImportStatus, 2000);
      })
      .catch(error => {
        console.error("Import failed:", error);
        setImportMessage('An error occurred during import.');
      });
  };

  useEffect(() => {
    // This is a cleanup function to stop polling if the component is unmounted.
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleEntityClick = (entityText: string) => {
    const filtered = entries.filter(entry => entry.content.includes(entityText));
    setFilteredEntries(filtered);
  };
  
  const resetFilter = () => {
    setFilteredEntries(entries);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults(null);
    fetch('http://localhost:8000/api/search/semantic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery }),
    })
      .then(res => res.json())
      .then(data => setSearchResults(data))
      .catch(console.error)
      .finally(() => setIsSearching(false));
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
      
      <div className="card grid-col-span-12">
        <h2>Search by Feeling, Not by Keyword</h2>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="e.g., times I felt hopeful about the future..."
            style={{ flexGrow: 1, padding: '0.5rem' }}
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {(isSearching || searchResults) && (
        <div className="card grid-col-span-12">
          <h2>Search Results</h2>
          {isSearching && <LoadingSpinner />}
          {searchResults && <SearchResults results={searchResults} />}
        </div>
      )}

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

        <div className="card grid-col-span-8">
          <h2>Sentiment Analysis</h2>
          <SentimentAnalysis />
        </div>
        
        <div className="card grid-col-span-4">
            <h2>Notes & Observations</h2>
            <p><i>This space can be used for future features or generated summaries.</i></p>
        </div>

        <div className="card grid-col-span-6">
          <h2>Discovered Topics</h2>
          {isLoading.topics ? <LoadingSpinner /> : (
            <ul className="topics-list">
              {topicData.length > 0 ? topicData.map(topic => (
                <li key={topic.topic_id}>
                  <strong>Topic {topic.topic_id + 1}:</strong> {topic.keywords.join(', ')}
                </li>
              )) : <p><i>No topics found.</i></p>}
            </ul>
          )}
        </div>

        <div className="card grid-col-span-6">
          <h2>Entries ({filteredEntries.length} of {entries.length})</h2>
          {isLoading.entries ? <LoadingSpinner /> : (
            <div className="entry-list">
              {filteredEntries.map(entry => (
                <div key={entry.id} className="entry-item">
                  <h3>{entry.entry_date.substring(0, 10)}</h3>
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