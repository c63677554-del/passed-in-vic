(() => {
  const s = document.getElementById("sortBy");
  if (!s) return "no sortBy";
  const opt = [...s.options].find(o => /high/i.test(o.textContent));
  if (!opt) return "no high-price option: " + [...s.options].map(o => o.textContent).join("|");
  s.value = opt.value;
  s.dispatchEvent(new Event("change", { bubbles: true }));
  s.dispatchEvent(new Event("input", { bubbles: true }));
  return "sorted by " + opt.textContent + "; pins " + document.querySelectorAll(".leaflet-marker-icon").length;
})()
