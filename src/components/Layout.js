"use client";
export default function Layout({ children }) {
  return (
    <div className="h-screen flex flex-col">
      <main className="flex-1">{children}</main>
    </div>
  );
}
