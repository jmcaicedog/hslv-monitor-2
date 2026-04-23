"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import {
  createUser,
  deleteUser,
  fetchCurrentUser,
  fetchUsers,
  updateUser,
} from "@/utils/api";

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    const userResponse = await fetchCurrentUser();
    const me = userResponse.user;

    if (me.role !== "admin") {
      router.replace("/");
      return;
    }

    setCurrentUserId(me.id);

    const usersResponse = await fetchUsers();
    setUsers(usersResponse.users || []);
  }

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setError("");
        await loadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar usuarios.");
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [router]);

  async function handleCreate(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      await createUser({ name, email, password, role });

      setName("");
      setEmail("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId, nextRole) {
    try {
      setError("");
      await updateUser(userId, { role: nextRole });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el rol.");
    }
  }

  async function handleDelete(userId) {
    const confirmed = window.confirm("Esta accion eliminara el usuario. Deseas continuar?");

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await deleteUser(userId);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el usuario.");
    }
  }

  async function handleAuthorization(userId, shouldBan) {
    try {
      setError("");
      await updateUser(userId, { banned: shouldBan });
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo actualizar el estado."
      );
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <p>Cargando administracion de usuarios...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Administracion de usuarios</h1>
          <button
            onClick={() => router.push("/")}
            className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full flex items-center shadow-lg"
            title="Volver al inicio"
          >
            <Home size={20} />
          </button>
        </div>

        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-gray-700 bg-gray-800 p-4"
        >
          <h2 className="mb-4 text-lg font-semibold">Crear usuario</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="text"
              placeholder="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
              required
            />
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
              required
            />
            <input
              type="password"
              placeholder="Contrasena (min 8)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
              required
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
            >
              <option value="user">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full sm:w-auto rounded-md bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-800"
          >
            {saving ? "Creando..." : "Crear usuario"}
          </button>
        </form>

        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h2 className="mb-4 text-lg font-semibold">Usuarios registrados</h2>

          <div className="space-y-3 md:hidden">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;

              return (
                <div
                  key={user.id}
                  className="rounded-lg border border-gray-700 bg-gray-900 p-4"
                >
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-gray-400 break-all">{user.email}</p>

                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div>
                      <p className="mb-1 text-xs text-gray-400">Rol</p>
                      <select
                        value={user.role || "user"}
                        onChange={(event) =>
                          handleRoleChange(user.id, event.target.value)
                        }
                        className="w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                      >
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>

                    <div>
                      <p className="mb-1 text-xs text-gray-400">Estado</p>
                      <p className="text-sm">{user.banned ? "Bloqueado" : "Activo"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAuthorization(user.id, !user.banned)}
                        disabled={isSelf}
                        className="rounded-md bg-amber-600 px-3 py-2 text-sm hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-900"
                      >
                        {user.banned ? "Autorizar" : "Bloquear"}
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={isSelf}
                        className="rounded-md bg-red-600 px-3 py-2 text-sm hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-300">
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Correo</th>
                  <th className="py-2">Rol</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Autorizacion</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;

                  return (
                    <tr key={user.id} className="border-b border-gray-800">
                      <td className="py-2">{user.name}</td>
                      <td className="py-2">{user.email}</td>
                      <td className="py-2">
                        <select
                          value={user.role || "user"}
                          onChange={(event) =>
                            handleRoleChange(user.id, event.target.value)
                          }
                          className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1"
                        >
                          <option value="user">Usuario</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </td>
                      <td className="py-2">
                        {user.banned ? "Bloqueado" : "Activo"}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleAuthorization(user.id, !user.banned)}
                          disabled={isSelf}
                          className="rounded-md bg-amber-600 px-3 py-1 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-900"
                        >
                          {user.banned ? "Autorizar" : "Bloquear"}
                        </button>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={isSelf}
                          className="rounded-md bg-red-600 px-3 py-1 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
