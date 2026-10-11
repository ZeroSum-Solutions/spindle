import type { ReactNode } from "react";

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

export function ErrorNote({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
      {message}
    </p>
  );
}

export function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        className="min-h-11 rounded-md border border-foreground/20 bg-background px-3 focus-visible:outline-2 focus-visible:outline-offset-2"
        {...props}
      />
    </label>
  );
}

export function Button({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      className="min-h-11 rounded-md bg-foreground px-4 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}
