import { useState } from 'react';
import './App.css';

function App() {
  const [importMessage, setImportMessage] = useState('');

  const handleImport = () => {
    setImportMessage('Importing...');
    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(response => response.json())
      .then(data => setImportMessage(data.message))
      .catch(error => setImportMessage(`Error: ${error.message}`));
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Journal Insights</h1>
      </header>
      <div className="card">
        <h2>Actions</h2>
        <button onClick={handleImport}>Import Journal Entries</button>
        {importMessage && <p><i>{importMessage}</i></p>}
      </div>
      {/* Will add Journal Viewer here later */}
    </div>
  );
}

export default App;