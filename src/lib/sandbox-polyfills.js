import * as XLSX from "xlsx";

if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : { value: raw };
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
    },
  };
}

if (!window.XLSX) {
  window.XLSX = XLSX;
}
