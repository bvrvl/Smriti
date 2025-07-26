import { useState, useEffect } from 'react';
import Select, { StylesConfig } from 'react-select';
import { VennDiagram } from 'reaviz';

// --- Interfaces ---
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }
interface VennSet { key: string[]; data: number; }

interface ConnectionEngineProps {
  nerData: NerData | null;
}

// --- Custom Styles for react-select dark mode ---
const selectStyles: StylesConfig = {
    control: (base) => ({
        ...base,
        backgroundColor: '#424242',
        borderColor: '#555',
        color: 'white',
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: '#424242',
    }),
    option: (base, { isFocused, isSelected }) => ({
        ...base,
        backgroundColor: isSelected ? '#646cff' : isFocused ? '#555' : '#424242',
        color: 'white',
        ':active': {
            backgroundColor: '#555',
        },
    }),
    multiValue: (base) => ({
        ...base,
        backgroundColor: '#555',
    }),
    multiValueLabel: (base) => ({
        ...base,
        color: 'white',
    }),
    input: (base) => ({
        ...base,
        color: 'white',
    }),
    placeholder: (base) => ({
        ...base,
        color: '#ccc',
    }),
    singleValue: (base) => ({
        ...base,
        color: 'white',
    }),
};


export const ConnectionEngine = ({ nerData }: ConnectionEngineProps) => {
  const allEntities = nerData ? [...nerData.people, ...nerData.places, ...nerData.orgs].map(e => e.text) : [];
  const uniqueEntities = Array.from(new Set(allEntities)).sort();
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
      <Select
        isMulti
        options={selectOptions}
        value={selectedEntities}
        onChange={(options) => setSelectedEntities(options as any)}
        placeholder="Select 2 to 4 entities..."
        isOptionDisabled={() => selectedEntities.length >= 4}
        styles={selectStyles}
      />
      <div className="venn-diagram-container">
        {vennData && vennData.length > 0 && (
          <VennDiagram height={250} width={450} data={vennData} />
        )}
      </div>
    </div>
  );
};