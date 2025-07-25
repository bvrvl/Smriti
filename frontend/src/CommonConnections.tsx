import { useState, useEffect } from 'react';
import Select, { StylesConfig } from 'react-select'; // Import Select here too

// --- Interfaces ---
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

interface CommonConnectionsProps {
  nerData: NerData | null;
}

// --- Custom Styles (can be moved to a shared file later) ---
const selectStyles: StylesConfig = {
    control: (base) => ({ ...base, backgroundColor: '#424242', borderColor: '#555', color: 'white' }),
    menu: (base) => ({ ...base, backgroundColor: '#424242' }),
    option: (base, { isFocused, isSelected }) => ({ ...base, backgroundColor: isSelected ? '#646cff' : isFocused ? '#555' : '#424242', color: 'white', ':active': { backgroundColor: '#555' } }),
    input: (base) => ({ ...base, color: 'white' }),
    placeholder: (base) => ({ ...base, color: '#ccc' }),
    singleValue: (base) => ({ ...base, color: 'white' }),
};


export const CommonConnections = ({ nerData }: CommonConnectionsProps) => {
  const allEntities = nerData ? [...nerData.people, ...nerData.places, ...nerData.orgs].map(e => e.text) : [];
  const uniqueEntities = Array.from(new Set(allEntities)).sort();
  const selectOptions = uniqueEntities.map(e => ({ value: e, label: e }));

  const [entity1, setEntity1] = useState<any>(null);
  const [entity2, setEntity2] = useState<any>(null);
  const [commonData, setCommonData] = useState<EntityCount[]>([]);

  useEffect(() => {
    if (entity1 && entity2 && entity1.value !== entity2.value) {
      fetch(`http://localhost:8000/api/analysis/common-connections?entity1=${entity1.value}&entity2=${entity2.value}`)
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
        <Select options={selectOptions} value={entity1} onChange={setEntity1} placeholder="Select first..." styles={selectStyles} />
        <span>AND</span>
        <Select options={selectOptions} value={entity2} onChange={setEntity2} placeholder="Select second..." styles={selectStyles} />
      </div>
      <div className="results-list">
        <h4>Commonly Associated With:</h4>
        {commonData.length > 0 ? (
            <ul>{commonData.map(item => (<li key={item.text}>{item.text} ({item.count})</li>))}</ul>
        ) : (<p><i>Select two different entities.</i></p>)}
      </div>
    </div>
  );
};