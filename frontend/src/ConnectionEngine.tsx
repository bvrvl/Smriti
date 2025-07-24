import { useState, useEffect } from 'react';
import { VennDiagram } from 'reaviz';

// --- Interfaces for our data shapes ---
interface EntityCount { text: string; count: number; }
interface NerData {
  people: EntityCount[];
  places: EntityCount[];
  orgs: EntityCount[];
}
interface CoOccurrenceData {
    set1_exclusive: number;
    set2_exclusive: number;
    intersection: number;
}

interface ConnectionEngineProps {
  nerData: NerData | null;
}

export const ConnectionEngine = ({ nerData }: ConnectionEngineProps) => {
  // Get a unique list of all entities from the NER data
  const allEntities = nerData ? [...nerData.people, ...nerData.places, ...nerData.orgs].map(e => e.text) : [];
  const uniqueEntities = Array.from(new Set(allEntities)).sort();

  // --- State management ---
  const [entity1, setEntity1] = useState<string>('');
  const [entity2, setEntity2] = useState<string>('');
  const [vennData, setVennData] = useState<any[] | null>(null);

  // --- Effect to fetch data when selections change ---
  useEffect(() => {
    if (entity1 && entity2 && entity1 !== entity2) {
      fetch(`http://localhost:8000/api/analysis/co-occurrence?entity1=${entity1}&entity2=${entity2}`)
        .then(res => res.json())
        .then((data: CoOccurrenceData) => {
          // The 'reaviz' library wants the size of the *entire* circle, not just the exclusive part.
          // So, we have to add the intersection back to each exclusive set.
          const formattedData = [
            { key: [entity1], data: data.set1_exclusive + data.intersection },
            { key: [entity2], data: data.set2_exclusive + data.intersection },
            { key: [entity1, entity2], data: data.intersection },
          ];
          setVennData(formattedData);
        })
        .catch(console.error);
    } else {
        setVennData(null); // Clear diagram if selections are invalid
    }
  }, [entity1, entity2]);

  return (
    <div className="connection-engine">
      <div className="selectors">
        <select value={entity1} onChange={e => setEntity1(e.target.value)}>
          <option value="">Select first entity...</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={entity2} onChange={e => setEntity2(e.target.value)}>
          <option value="">Select second entity...</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="venn-diagram-container">
        {vennData && (
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