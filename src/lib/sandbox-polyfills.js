import * as XLSX from "xlsx";

if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const res = await fetch(`/api/storage/${encodeURIComponent(key)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`storage get failed: ${res.status}`);
      return { value: (await res.json()).value };
    },
    set: async (key, value) => {
      const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(`storage set failed: ${res.status}`);
    },
  };
}

if (!window.XLSX) {
  window.XLSX = XLSX;
}
