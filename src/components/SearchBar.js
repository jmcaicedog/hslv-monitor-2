export default function SearchBar({ value, onChange }) {
  return (
    <div className="w-full py-2 mx-auto">
      <input
        type="text"
        placeholder="🔍 Buscar sensor..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
      />
    </div>
  );
}
