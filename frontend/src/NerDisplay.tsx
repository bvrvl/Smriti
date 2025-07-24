interface EntityCount {
    text: string;
    count: number;
  }
  
  interface NerData {
    people: EntityCount[];
    places: EntityCount[];
    orgs: EntityCount[];
  }
  
  interface NerDisplayProps {
    nerData: NerData | null;
  }
  
  export const NerDisplay = ({ nerData }: NerDisplayProps) => {
    if (!nerData) return <p>Loading NER data...</p>;
  
    return (
      <div className="ner-container">
        <div className="card">
          <h2>Most Mentioned People</h2>
          <ul>
            {nerData.people.map(p => <li key={p.text}>{p.text} ({p.count})</li>)}
          </ul>
        </div>
        <div className="card">
          <h2>Most Mentioned Places</h2>
          <ul>
            {nerData.places.map(p => <li key={p.text}>{p.text} ({p.count})</li>)}
          </ul>
        </div>
        <div className="card">
          <h2>Most Mentioned Orgs</h2>
          <ul>
            {nerData.orgs.map(o => <li key={o.text}>{o.text} ({o.count})</li>)}
          </ul>
        </div>
      </div>
    );
  };