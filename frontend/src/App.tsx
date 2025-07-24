import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState('Loading...');

  useEffect(() => {
    fetch('http://localhost:8000/')
      .then(response => response.json())
      .then(data => setMessage(data.message))
      .catch(error => setMessage(`Error: ${error.message}`));
  }, []);

  return (
    <div className="App">
      <h1>Smriti</h1>
      <p>Message from backend: <strong>{message}</strong></p>
    </div>
  );
}

export default App;