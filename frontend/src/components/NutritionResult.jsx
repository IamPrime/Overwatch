export function NutritionResult({ tag, blobUrl, error, onEnlarge }) {
  if (error) {
    return <p>{error}</p>;
  }

  if (!tag) {
    return null;
  }

  return (
    <>
      <h3>{tag}</h3>
      {blobUrl && (
        <img
          src={blobUrl}
          className="zoomable"
          title="Click to enlarge"
          alt={`Nutrition facts for ${tag}`}
          onClick={() => onEnlarge(blobUrl)}
        />
      )}
    </>
  );
}
