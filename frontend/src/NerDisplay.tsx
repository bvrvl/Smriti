interface EntityCount { text: string; count: number; }
interface NerData {
  people: EntityCount[];
  places: EntityCount[];
  orgs: EntityCount[];
}

interface NerDisplayProps {
  nerData: NerData | null;
  onEntityClick: (entityText: string) => void;
}

export const NerDisplay = ({ nerData, onEntityClick }: NerDisplayProps) => {
  if (!nerData) return <p>Loading NER data...</p>;

  const createClickHandler = (text: string) => () => onEntityClick(text);

  return (
    <div className="ner-container">
      <div className="card-inner">
        <h2>People</h2>
        <ul>
          {nerData.people.map(p => <li key={p.text}><button onClick={createClickHandler(p.text)}>{p.text} ({p.count})</button></li>)}
        </ul>
      </div>
      <div className="card-inner">
        <h2>Places</h2>
        <ul>
          {nerData.places.map(p => <li key={p.text}><button onClick={createClickHandler(p.text)}>{p.text} ({p.count})</button></li>)}
        </ul>
      </div>
      <div className="card-inner">
        <h2>Orgs</h2>
        <ul>
          {nerData.orgs.map(o => <li key={o.text}><button onClick={createClickHandler(o.text)}>{o.text} ({o.count})</button></li>)}
        </ul>
      </div>
    </div>
  );
};