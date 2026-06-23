import { useEffect, useState } from "react";
export default function Sidebar({ locations, onSelectLocation, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const uniqueLocations = [...new Set(locations)];

  useEffect(() => {
    if (typeof onOpenChange === "function") {
      onOpenChange(isOpen);
    }
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <button
        className={`fixed top-4 left-4 z-[220] bg-gray-700 text-white px-4 py-2 rounded-md shadow-lg lg:hidden ${
          isOpen ? "hidden" : "block"
        }`}
        onClick={() => setIsOpen(true)}
      >
        ☰
      </button>
      {isOpen ? (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-[100] bg-black/45 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-[110] w-[min(22rem,92vw)] bg-gray-800 text-white p-4 transition-transform transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:relative lg:inset-auto lg:left-auto lg:z-auto lg:w-64 lg:translate-x-0`}
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
