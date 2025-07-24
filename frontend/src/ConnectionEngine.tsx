// UPGRADED version of /frontend/src/ConnectionEngine.tsx
import { useState, useEffect } from 'react';
import Select from 'react-select';
import { VennDiagram } from 'reaviz';

interface EntityCount { text: string; count: number; }
interface NerData {
  people: EntityCount[];
  places: EntityCount[];
  orgs: EntityCount[];
}
interface VennSet { key: string[]; data: number; }

interface ConnectionEngineProps {
  nerData: NerData | null;
}

export const ConnectionEngine = ({ nerData }: ConnectionEngineProps) => {
  const allEntities = nerData ? [...nerData.people, ...nerData.places, ...nerData.orgs].map(e => e.text) : [];
  const uniqueEntities = Array.from(new Set(allEntities)).sort();
  
  // react-select expects options in { value: string, label: string } format
  const selectOptions = uniqueEntities.map(e => ({ value: e, label: e }));

  const [selectedEntities, setSelectedEntities] = useState<{ value: string; label: string; }[]>([]);
  const [vennData, setVennData] = useState<VennSet[] | null>(null);

  useEffect(() => {
    const entityValues = selectedEntities.map(e => e.value);
    
    if (entityValues.length >= 2) {
      fetch('http://localhost:8000/api/analysis/co-occurrence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities: entityValues }),
      })
        .then(res => res.json())
        .then(data => setVennData(data))
        .catch(console.error);
    } else {
        setVennData(null);
    }
  }, [selectedEntities]);

  return (
    <div className="connection-engine">
      <div className="selectors">
        <Select
          isMulti
          options={selectOptions}
          value={selectedEntities}
          onChange={(options) => setSelectedEntities(options as any)}
          placeholder="Select 2 to 4 entities..."
          isOptionDisabled={() => selectedEntities.length >= 4}
        />
      </div>
      <div className="venn-diagram-container">
        {vennData && vennData.length > 0 && (
          <VennDiagram
            height={300}
            width={500}
            data={vennData}
          />
        )}
      </div>
    </div>
  );
};