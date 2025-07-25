import { useState, useEffect, useRef } from 'react';

// Import all custom components and styles
import './App.css';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';
import { OnThisDay } from './OnThisDay';
import { LoadingSpinner } from './LoadingSpinner';
import { SentimentAnalysis } from './SentimentAnalysis';
import { SearchResults } from './SearchResults';

// --- Type Definitions ---
interface JournalEntry { id: number; entry_date: string; content: string; tags: string | null; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

// This defines the possible states our application can be in, for a better UX.
type AppStatus = 'initializing' | 'importing' | 'embedding' | 'analyzing' | 'ready';

function App() {
  // --- State Management ---
  // A single state variable to track the overall application status.
  const [appStatus, setAppStatus] = useState<AppStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState('Initializing application...');
  
  // All our data states
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  const [onThisDayData, setOnThisDayData] = useState<JournalEntry[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<JournalEntry[] | null>(null);

  const pollingIntervalRef = useRef<number | null>(null);
  
  // --- Data Fetching ---
  const fetchAllData = async () => {
    // When we fetch, the app is in an "analyzing" state.
    setAppStatus('analyzing');
    setStatusMessage('Analyzing entries...');

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
    
    setAppStatus('ready');
    setStatusMessage(''); // Clear the status message when done
  };

  useEffect(() => {
    fetchAllData(); // Initial data load when the app mounts
  }, []);

  // --- User Actions ---
  const checkEmbeddingStatus = () => {
    fetch('http://localhost:8000/api/import/status')
      .then(res => res.json())
      .then(status => {
        if (status.status === 'processing') {
          setStatusMessage(`Embedding entries... (${status.progress} / ${status.total})`);
        } else { // status is 'idle'
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          // Now that embedding is done, we move to the 'analyzing' state by fetching all data.
          fetchAllData();
        }
      });
  };

  const handleImport = () => {
    setAppStatus('importing');
    setStatusMessage('Importing files...');
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setAppStatus('embedding'); // After import, the app is in the 'embedding' state.
        setStatusMessage(data.message); // Show initial message
        pollingIntervalRef.current = setInterval(checkEmbeddingStatus, 2000);
      })
      .catch(error => {
        console.error("Import failed:", error);
        setStatusMessage('An error occurred during import.');
        setAppStatus('ready'); // Reset to ready on failure
      });
  };

  useEffect(() => {
    // This cleanup function stops polling if the app is closed.
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
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
          <button onClick={handleImport} disabled={appStatus !== 'ready'}>
            {appStatus === 'ready' ? 'Import Journal Entries' : 'Processing...'}
          </button>
          <button onClick={resetFilter}>Reset Entry Filter</button>
          {statusMessage && <p><i>{statusMessage}</i></p>}
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
          <button type="submit" disabled={isSearching || appStatus !== 'ready'}>
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

      {/* Conditionally render the entire dashboard based on the app's status */}
      {appStatus === 'initializing' && <div className="card grid-col-span-12"><LoadingSpinner /></div>}
      
      {appStatus !== 'initializing' && (
        <div className="dashboard-container">
          <div className="card grid-col-span-12">
            <h2>On This Day in Your History</h2>
            {appStatus !== 'ready' ? <LoadingSpinner /> : <OnThisDay entries={onThisDayData} />}
          </div>

          <div className="card grid-col-span-12">
            <h2>Sentiment Heatmap</h2>
            {appStatus !== 'ready' ? <LoadingSpinner /> : <HeatmapDisplay sentimentData={sentimentData} />}
          </div>

          <div className="card grid-col-span-12">
            {appStatus !== 'ready' ? <LoadingSpinner /> : <NerDisplay nerData={nerData} onEntityClick={handleEntityClick} />}
          </div>
          
          <div className="card grid-col-span-6">
            <h2>Connection Engine</h2>
            {appStatus !== 'ready' ? <LoadingSpinner /> : <ConnectionEngine nerData={nerData} />}
          </div>

          <div className="card grid-col-span-6">
            <h2>Common Connection Discovery</h2>
            {appStatus !== 'ready' ? <LoadingSpinner /> : <CommonConnections nerData={nerData} />}
          </div>

          <div className="card grid-col-span-8">
            <h2>Sentiment Analysis</h2>
            {appStatus !== 'ready' ? <LoadingSpinner /> : <SentimentAnalysis />}
          </div>
          
          <div className="card grid-col-span-4">
              <h2>Notes & Observations</h2>
              <p><i>This space can be used for future features or generated summaries.</i></p>
          </div>

          <div className="card grid-col-span-6">
            <h2>Discovered Topics</h2>
            {appStatus !== 'ready' ? <LoadingSpinner /> : (
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
            {appStatus !== 'ready' ? <LoadingSpinner /> : (
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
      )}
    </div>
  );
}

export default App;