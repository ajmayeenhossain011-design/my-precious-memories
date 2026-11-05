/* MY PRECIOUS MEMORIES — management UI
   All writes call the server-side memory-admin Edge Function. */
(() => {
  const $ = (id) => document.getElementById(id);
  const BUCKET_NAME = "PRECIOUS MEMORIES";
  const style = document.createElement("style");
  style.textContent = `
    .manage-top-btn{margin-left:8px;border:1px solid rgba(203,184,145,.45);background:rgba(20,19,16,.88);color:#e5d7b8;border-radius:999px;padding:9px 15px;font:inherit;font-size:13px;cursor:pointer}
    .manage-menu-wrap{position:relative;display:flex;justify-content:flex-end;padding:7px 10px 10px;z-index:5}
    .manage-menu-trigger{width:34px;height:34px;border:1px solid rgba(203,184,145,.38);border-radius:50%;background:rgba(18,17,15,.94);color:#e5c276;font-size:21px;line-height:1;cursor:pointer;display:grid;place-items:center}
    .manage-menu{position:absolute;right:10px;top:43px;min-width:150px;padding:5px;background:#171613;border:1px solid rgba(203,184,145,.42);border-radius:12px;box-shadow:0 12px 30px #000b;display:none;z-index:20}
    .manage-menu.open{display:block}
    .manage-menu-item{display:block;width:100%;padding:10px 12px;text-align:left;border:0;border-radius:8px;background:transparent;color:#eee5d4;font:inherit;font-size:13px;cursor:pointer}
    .manage-menu-item:hover{background:rgba(203,184,145,.12)}
    .manage-menu-item.danger{color:#e89a91}
    .memory{position:relative}
    .memory .manage-menu-wrap{position:absolute;right:5px;top:5px;padding:0}
    .memory .manage-menu{top:38px;right:0}
    .text-memory-card{position:relative;padding-right:52px}
    .text-memory-card .manage-menu-wrap{position:absolute;right:8px;top:8px;padding:0}
    .text-memory-card .manage-menu{top:38px;right:0}
    .admin-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:18px}
    .admin-overlay.hidden{display:none}
    .admin-dialog{width:min(100%,430px);background:linear-gradient(145deg,#191815,#080807);border:1px solid #c8a45c;border-radius:20px;padding:24px;box-shadow:0 24px 80px #000;color:#f4efe5}
    .admin-dialog h3{color:#e5c276;margin:0 0 8px;font-size:22px}.admin-dialog p{color:#b7ad9b;line-height:1.5}
    .admin-dialog input,.admin-dialog textarea{width:100%;margin:10px 0;padding:13px;border-radius:10px;border:1px solid rgba(203,184,145,.4);background:#0d0d0c;color:#fff;font:inherit}
    .admin-dialog textarea{min-height:110px;resize:vertical}
    .admin-dialog-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
    .admin-dialog-actions button{padding:11px 16px;border-radius:10px;border:1px solid #b99a58;background:#d6b46d;color:#17130b;font-weight:700}
    .admin-dialog-actions .cancel{background:#222;color:#eee;border-color:#555}
    .text-memory-card{border:1px solid rgba(203,184,145,.35);background:rgba(20,19,16,.75);border-radius:14px;padding:16px;margin:12px 0}
    .text-memory-card p{white-space:pre-wrap;line-height:1.6;margin:0 0 12px}
    .text-memory-actions{display:flex;justify-content:flex-end;gap:8px}
    .management-note{color:#b7ad9b;font-size:13px}
  `;
  document.head.append(style);

  const overlay = document.createElement("div");
  overlay.id = "adminOverlay";
  overlay.className = "admin-overlay hidden";
  overlay.innerHTML = `<form class="admin-dialog" id="adminDialogForm"><h3 id="adminDialogTitle">Master Password Required</h3><p id="adminDialogText">Enter your separate Master Password to continue.</p><input id="adminDialogInput" type="password" autocomplete="current-password" required placeholder="Master Password"><div class="admin-dialog-actions"><button type="button" class="cancel" id="adminDialogCancel">Cancel</button><button type="submit" id="adminDialogSubmit">Verify</button></div></form>`;
  document.body.append(overlay);

  function passwordDialog(title, description, submitLabel = "Verify", inputType = "password") {
    return new Promise((resolve) => {
      $("adminDialogTitle").textContent = title;
      $("adminDialogText").textContent = description;
      $("adminDialogSubmit").textContent = submitLabel;
      $("adminDialogInput").type = inputType;
      $("adminDialogInput").value = "";
      overlay.classList.remove("hidden");
      const finish = (value) => {
        overlay.classList.add("hidden");
        $("adminDialogForm").onsubmit = null;
        $("adminDialogCancel").onclick = null;
        resolve(value);
      };
      $("adminDialogCancel").onclick = () => finish(null);
      $("adminDialogForm").onsubmit = (event) => {
        event.preventDefault();
        const value = $("adminDialogInput").value;
        finish(value || null);
      };
      $("adminDialogInput").focus();
    });
  }

  async function adminCall(action, payload = {}, masterPassword = "") {
    const { data, error } = await db.functions.invoke("bright-processor", {
      body: { action, ...payload, masterPassword }
    });
    if (error) throw new Error(error.message || "Management request failed.");
    if (!data || data.error) throw new Error(data?.error || "Management request failed.");
    return data;
  }

  async function askVerifiedPassword() {
    const value = await passwordDialog("Master Password Required", "Enter your separate Master Password to authorize this change.");
    return value;
  }
  function showError(error) { alert(error?.message || String(error)); }
  function makeActionMenu(actions) {
    const wrap = document.createElement("div");
    wrap.className = "manage-menu-wrap";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "manage-menu-trigger";
    trigger.textContent = "⋮";
    trigger.setAttribute("aria-label", "More actions");
    trigger.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "manage-menu";
    actions.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manage-menu-item" + (item.danger ? " danger" : "");
      button.textContent = item.label;
      button.onclick = async event => {
        event.stopPropagation();
        menu.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
        await item.run(event);
      };
      menu.append(button);
    });
    trigger.onclick = event => {
      event.stopPropagation();
      const opening = !menu.classList.contains("open");
      document.querySelectorAll(".manage-menu.open").forEach(el => el.classList.remove("open"));
      menu.classList.toggle("open", opening);
      trigger.setAttribute("aria-expanded", String(opening));
    };
    wrap.append(trigger, menu);
    return wrap;
  }
  document.addEventListener("click", () => {
    document.querySelectorAll(".manage-menu.open").forEach(el => el.classList.remove("open"));
  });


  async function setupOrChangeMaster() {
    try {
      const { data, error } = await db.functions.invoke("bright-processor", { body: { action: "status" } });
      if (error) throw error;
      if (!data?.hasMasterPassword) {
        const next = await passwordDialog("Create Master Password", "Choose a unique password with at least 10 characters. It is separate from your Supabase login.", "Create");
        if (!next) return;
        const again = await passwordDialog("Confirm Master Password", "Enter the same new Master Password again.", "Confirm");
        if (next !== again) throw new Error("The two passwords did not match.");
        await adminCall("setupMasterPassword", {}, next);
        alert("Master Password created successfully.");
      } else {
        if (!confirm("A Master Password is already set. Do you want to change it?")) return;
        const current = await askVerifiedPassword();
        if (!current) return;
        const next = await passwordDialog("New Master Password", "Choose a new password with at least 10 characters.", "Continue");
        if (!next) return;
        const again = await passwordDialog("Confirm New Password", "Enter the new password again.", "Change");
        if (next !== again) throw new Error("The two passwords did not match.");
        await adminCall("changeMasterPassword", { newMasterPassword: next }, current);
        alert("Master Password changed successfully.");
      }
    } catch (error) { showError(error); }
  }

  const nav = document.querySelector(".main-nav");
  const textNav = document.createElement("button");
  textNav.type = "button"; textNav.className = "nav-btn"; textNav.textContent = "▤ Text Memories";
  textNav.onclick = () => openTextMemories();
  nav?.append(textNav);

  const manageBtn = document.createElement("button");
  manageBtn.type = "button"; manageBtn.className = "manage-top-btn"; manageBtn.textContent = "♙ Manage";
  manageBtn.onclick = setupOrChangeMaster;
  document.querySelector(".account-area")?.prepend(manageBtn);

  const textView = document.createElement("section");
  textView.id = "textMemoriesView"; textView.className = "upload-view hidden";
  textView.innerHTML = `<div class="section-kicker">WORDS TO KEEP FOREVER</div><h2>Text Memories</h2><p class="management-note">Private thoughts, notes and moments worth remembering.</p><button id="addTextMemoryBtn" class="primary-btn" type="button">＋ Add Memory</button><div id="textMemoriesList"></div>`;
  document.querySelector(".main-shell")?.append(textView);

  const baseSetPage = window.setPage;
  window.setPage = function(page) {
    textView.classList.toggle("hidden", page !== "text");
    textNav.classList.toggle("active", page === "text");
    if (page === "text") {
      baseSetPage("home");
      $("heroBanner").classList.add("hidden");
      $("collectionSection").classList.add("hidden");
      $("uploadView").classList.add("hidden");
      $("albumView").classList.add("hidden");
      textView.classList.remove("hidden");
    } else {
      baseSetPage(page);
    }
  };

  async function openTextMemories() {
    window.setPage("text");
    await loadTextMemories();
  }
  async function loadTextMemories() {
    const list = $("textMemoriesList");
    list.textContent = "Loading memories…";
    const { data, error } = await db.from("text_memories").select("id,content,created_at").order("created_at", { ascending: false });
    list.innerHTML = "";
    if (error) { list.textContent = "Text Memories setup is not ready yet. " + error.message; return; }
    if (!data?.length) { list.textContent = "No text memories yet. Add your first one."; return; }
    for (const item of data) {
      const card = document.createElement("article"); card.className = "text-memory-card";
      const p = document.createElement("p"); p.textContent = item.content;
      const actions = makeActionMenu([
        { label: "Edit memory", run: async () => {
          const content = prompt("Edit your memory:", item.content);
          if (content === null || !content.trim()) return;
          const pass = await askVerifiedPassword(); if (!pass) return;
          try { await adminCall("updateText", { id: item.id, content }, pass); await loadTextMemories(); }
          catch (e) { showError(e); }
        }},
        { label: "Delete memory", danger: true, run: async () => {
          if (!confirm("Delete this text memory?")) return;
          const pass = await askVerifiedPassword(); if (!pass) return;
          if (!confirm("Final confirmation: permanently delete this memory?")) return;
          try { await adminCall("deleteText", { id: item.id }, pass); await loadTextMemories(); }
          catch (e) { showError(e); }
        }}
      ]);
      card.append(p, actions); list.append(card);
    }
  }

  $("addTextMemoryBtn").onclick = async () => {
    const content = prompt("Write your memory (up to 5000 characters):");
    if (content === null || !content.trim()) return;
    const pass = await askVerifiedPassword(); if (!pass) return;
    try { await adminCall("addText", { content }, pass); await loadTextMemories(); }
    catch (e) { showError(e); }
  };

  const originalRenderAlbums = window.renderAlbums;
  window.renderAlbums = function() {
    originalRenderAlbums();
    document.querySelectorAll("#albums .album").forEach((card, index) => {
      const album = albums[index]; if (!album) return;
      const actions = makeActionMenu([
        { label: "Edit album", run: async (event) => {
          event.stopPropagation();
          const pass = await askVerifiedPassword(); if (!pass) return;
          const title = prompt("Album name:", album.title); if (title === null || !title.trim()) return;
          const description = prompt("Album description:", album.description || ""); if (description === null) return;
          try { await adminCall("updateAlbum", { date: album.date, title, description }, pass); await loadAlbums(); }
          catch (e) { showError(e); }
        }},
        { label: "Delete album", danger: true, run: async (event) => {
          event.stopPropagation();
          if (!confirm("Delete this entire album and all its photos/videos?")) return;
          const pass = await askVerifiedPassword(); if (!pass) return;
          if (!confirm("Final confirmation: permanently delete this album and its media?")) return;
          try { await adminCall("deleteAlbum", { date: album.date }, pass); await loadAlbums(); }
          catch (e) { showError(e); }
        }}
      ]);
      card.append(actions);
    });
  };

  const originalRenderFiles = window.renderFiles;
  window.renderFiles = function() {
    originalRenderFiles();
    document.querySelectorAll("#gallery .memory").forEach((card, index) => {
      const file = currentFiles[index]; if (!file) return;
      const actions = makeActionMenu([
        { label: "Delete photo/video", danger: true, run: async (event) => {
          event.stopPropagation();
          if (!confirm("Delete this photo/video permanently?")) return;
          const pass = await askVerifiedPassword(); if (!pass) return;
          if (!confirm("Final confirmation: permanently delete this media file?")) return;
          try {
            await adminCall("deleteMedia", { path: file.path }, pass);
            currentFiles.splice(index, 1); renderFiles(); await loadAlbums();
          } catch (e) { showError(e); }
        }}
      ]);
      card.append(actions);
    });
  };

  $("uploadBtn").onclick = async () => {
    if (!currentUser) return alert("Please log in first.");
    const date = $("albumDate").value, title = $("albumTitle").value.trim();
    const description = $("albumDescription").value.trim(), selected = $("fileInput").files;
    if (!date || !title || !selected.length) return alert("Choose a date, album name, and at least one photo or video.");
    const pass = await askVerifiedPassword(); if (!pass) return;
    $("uploadBtn").disabled = true; isUploading = true;
    try {
      await adminCall("updateAlbum", { date, title, description }, pass);
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const signed = await adminCall("createUploadUrl", { date, fileName: file.name }, pass);
        const { error } = await db.storage.from(BUCKET_NAME).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw error;
      }
      $("fileInput").value = ""; $("albumTitle").value = ""; $("albumDescription").value = "";
      alert("Your memories were uploaded successfully.");
      await loadAlbums(); window.setPage("albums");
    } catch (e) { showError(e); }
    finally { isUploading = false; $("uploadBtn").disabled = false; }
  };

  // Wrap refresh after existing app initialization has defined all functions.
  const originalRefresh = $("refreshBtn")?.onclick;
  if ($("refreshBtn") && originalRefresh) $("refreshBtn").onclick = originalRefresh;
})();