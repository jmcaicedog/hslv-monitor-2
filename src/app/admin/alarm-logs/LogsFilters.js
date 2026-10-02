"use client";

export default function LogsFilters({ filters, onChange, extraLabel, extraOptions, extraKey, invalidRange }) {
  const inputClass = "w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-gray-300">
          Buscar
          <input
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Buscar en registros"
            className={inputClass}
          />
        </label>
        <label className="text-sm text-gray-300">
          {extraLabel}
          {extraOptions ? (
            <select
              value={filters[extraKey]}
              onChange={(event) => onChange({ ...filters, [extraKey]: event.target.value })}
              className={inputClass}
            >
              <option value="">{extraLabel === "Usuario" ? "Todos los usuarios" : "Todos los sensores"}</option>
              {extraOptions.map((option) => (
                <option key={option.id ?? option.value} value={option.id ?? option.value}>
                  {option.title || (option.name && option.name !== option.value ? `${option.name} (${option.value})` : option.value)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="search"
              value={filters[extraKey]}
              onChange={(event) => onChange({ ...filters, [extraKey]: event.target.value })}
              placeholder="Nombre o correo"
              className={inputClass}
            />
          )}
        </label>
        <label className="text-sm text-gray-300">
          Desde
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="text-sm text-gray-300">
          Hasta
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
            className={inputClass}
          />
        </label>
      </div>
      {invalidRange && <p className="mt-2 text-sm text-red-300">La fecha inicial debe ser menor o igual a la fecha final.</p>}
    </div>
  );
}