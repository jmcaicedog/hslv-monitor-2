import { useState } from "react";
export default function Sidebar({ locations, onSelectLocation }) {
  const [isOpen, setIsOpen] = useState(false);
  const uniqueLocations = [...new Set(locations)];

  return (
    <>
      <button
        className={`fixed top-4 right-4 z-50 bg-gray-700 text-white px-4 py-2 rounded-md lg:hidden ${
          isOpen ? "hidden" : "block"
        }`}
        onClick={() => setIsOpen(true)}
      >
        ☰
      </button>
      <aside
        className={`fixed inset-0 bg-gray-800 text-white p-4 transition-transform transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:relative lg:w-64 lg:translate-x-0`}
      >
        <button
          className="absolute top-4 right-4 text-white text-2xl lg:hidden"
          onClick={() => setIsOpen(false)}
        >
          ✖
        </button>
        <h2 className="text-xl font-bold">Ubicaciones</h2>
        <ul className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-8rem)] pr-2 hide-scrollbar">
          <li
            className="cursor-pointer hover:bg-gray-700 p-2 rounded font-bold"
            onClick={() => {
              onSelectLocation(null);
              setIsOpen(false);
            }}
          >
            🔄 Mostrar Todos
          </li>
          {uniqueLocations.map((location, index) => (
            <li
              key={index}
              className="cursor-pointer hover:bg-gray-700 p-2 rounded"
              onClick={() => {
                onSelectLocation(location);
                setIsOpen(false);
              }}
            >
              📍 {location}
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
