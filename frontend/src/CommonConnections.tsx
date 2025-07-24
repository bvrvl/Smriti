import { useState, useEffect } from 'react';

interface EntityCount { text: string; count: number; }
interface NerData {
  people: EntityCount[];
  places: EntityCount[];
  orgs: EntityCount[];
}

interface CommonConnectionsProps {
  nerData: NerData | null;
}

export const CommonConnections = ({ nerData }: CommonConnectionsProps) => {
  const allEntities = nerData ? [...nerData.people, ...nerData.places, ...nerData.orgs].map(e => e.text) : [];
  const uniqueEntities = Array.from(new Set(allEntities)).sort();

  const [entity1, setEntity1] = useState<string>('');
  const [entity2, setEntity2] = useState<string>('');
  const [commonData, setCommonData] = useState<EntityCount[]>([]);

  useEffect(() => {
    if (entity1 && entity2 && entity1 !== entity2) {
      fetch(`http://localhost:8000/api/analysis/common-connections?entity1=${entity1}&entity2=${entity2}`)
        .then(res => res.json())
        .then(data => setCommonData(data.common_entities))
        .catch(console.error);
    } else {
        setCommonData([]);
    }
  }, [entity1, entity2]);

  return (
    <div className="common-connections">
      <div className="selectors">
        <select value={entity1} onChange={e => setEntity1(e.target.value)}>
          <option value="">Select first entity...</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <span>AND</span>
        <select value={entity2} onChange={e => setEntity2(e.target.value)}>
          <option value="">Select second entity...</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="results-list">
        <h4>Commonly Associated With:</h4>
        {commonData.length > 0 ? (
            <ul>
                {commonData.map(item => (
                    <li key={item.text}>{item.text} ({item.count})</li>
                ))}
            </ul>
        ) : (
            <p><i>Select two different entities to see common connections.</i></p>
        )}
      </div>
    </div>
  );
};