document.querySelector("#access-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await fetch("/dev-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: new FormData(e.target).get("code") }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    if (location.pathname === "/dev-access") location.href = "/";
    else location.reload();
  } catch (err) {
    document.querySelector("#access-status").textContent = err.message;
  }
};
