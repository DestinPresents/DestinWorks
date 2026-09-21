const firebaseConfig = {
  apiKey: "AIzaSyDRZk8QbQogXg3esJ6fB9Y5Tbj0PDj52vo",
  authDomain: "destinworks.firebaseapp.com",
  projectId: "destinworks",
  storageBucket: "destinworks.firebasestorage.app",
  messagingSenderId: "737700226997",
  appId: "1:737700226997:web:09f44f8665c3a2ef4e9bfc"
};

    const CONFIG_PLACEHOLDER = "YOUR_";
    const isFirebaseConfigured = Object.values(firebaseConfig)
      .every(value => typeof value === "string" && !value.startsWith(CONFIG_PLACEHOLDER));

    if (!isFirebaseConfigured) {
      console.warn("Destin Work: Firebase config is still using placeholders. Add your Firebase Web App config in script.js."); 
    }

    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
    import {
      getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
      signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
      updateProfile
    } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
    import {
      getFirestore, doc, getDoc, setDoc, addDoc, collection,
      query, where, getDocs, serverTimestamp, runTransaction
    } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const $ = (id) => document.getElementById(id);

    function ensureFirebaseConfigured() {
      if (!isFirebaseConfigured) {
        toast("Firebase is not configured yet. Add your Firebase Web App config in script.js.", "error");
        return false;
      }
      return true;
    }

    function validEmail(value) {
      return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
    }

    let authMode = "login";
    let currentUser = null;
    let currentProfile = null;

    const views = {
      auth: $("authView"),
      dashboard: $("dashboardView"),
      submit: $("submitView")
    };

    function showView(name) {
      Object.values(views).forEach(v => v.classList.add("hidden"));
      views[name].classList.remove("hidden");
      window.scrollTo({top: 0, behavior: "smooth"});
    }

    function toast(message, type = "info") {
      const el = $("toast");
      el.textContent = message;
      el.className = `toast show ${type}`;
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
    }

    function setAuthMode(mode) {
      authMode = mode;
      const signup = mode === "signup";
      $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
      $("authSubtitle").textContent = signup
        ? "Create a Destin Work account to get started."
        : "Log in to continue to your dashboard.";
      $("nameGroup").classList.toggle("hidden", !signup);
      $("confirmGroup").classList.toggle("hidden", !signup);
      $("forgotBtn").classList.toggle("hidden", signup);
      $("authSubmit").textContent = signup ? "Create Account" : "Login";
      $("switchPrompt").textContent = signup ? "Already have an account?" : "Don't have an account?";
      $("switchMode").textContent = signup ? "Login" : "Create one";
      $("authPassword").setAttribute("autocomplete", signup ? "new-password" : "current-password");
    }

    async function generateUniquePublicId() {
      // Reserve a unique 6-digit public ID using a Firestore transaction.
      for (let attempt = 0; attempt < 12; attempt++) {
        const id = String(Math.floor(100000 + Math.random() * 900000));
        const ref = doc(db, "publicIds", id);
        try {
          const reserved = await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists()) return false;
            tx.set(ref, { uid: currentUser.uid, createdAt: serverTimestamp() });
            return true;
          });
          if (reserved) return id;
        } catch (err) {
          if (err.code !== "aborted") throw err;
        }
      }
      throw new Error("Could not generate a unique User ID. Please try again.");
    }

    async function createProfile(user, name) {
      const profileRef = doc(db, "users", user.uid);
      const existing = await getDoc(profileRef);
      if (existing.exists()) return existing.data();

      currentUser = user;
      const publicId = await generateUniquePublicId();
      const profile = {
        uid: user.uid,
        publicId,
        name: name.trim(),
        accountEmail: user.email || "",
        points: 0,
        createdAt: serverTimestamp()
      };
      await setDoc(profileRef, profile);
      return profile;
    }

    async function loadProfile(user) {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        // Existing Firebase accounts created outside this app can be given a profile.
        return await createProfile(user, user.displayName || (user.email || "User").split("@")[0]);
      }
      return snap.data();
    }

    function renderProfile(profile) {
      currentProfile = profile;
      const name = profile.name || "User";
      $("profileName").textContent = name;
      $("profileId").textContent = profile.publicId || "------";
      $("miniName").textContent = name;
      $("miniId").textContent = profile.publicId || "------";
      $("avatar").textContent = name.trim().charAt(0).toUpperCase() || "U";
      $("userMini").classList.remove("hidden");
      $("headerAuthBtn").textContent = "Dashboard";
    }

    $("authForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ensureFirebaseConfigured()) return;
      const email = $("authEmail").value.trim().toLowerCase();

      if (!validEmail(email)) {
        toast("Please enter a valid email address.", "error");
        return;
      }
      const password = $("authPassword").value;

      try {
        $("authSubmit").disabled = true;

        if (authMode === "signup") {
          const name = $("nameInput").value.trim();
          const confirm = $("confirmPassword").value;

          if (!name) throw new Error("Please enter your name.");
          if (password !== confirm) throw new Error("Passwords do not match.");
          if (password.length < 6) throw new Error("Password must be at least 6 characters.");

          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(cred.user, { displayName: name });
          currentUser = cred.user;
          const profile = await createProfile(cred.user, name);
          renderProfile(profile);
          showView("dashboard");
          toast("Account created successfully.", "success");
        } else {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          currentUser = cred.user;
          const profile = await loadProfile(cred.user);
          renderProfile(profile);
          showView("dashboard");
          toast("Login successful.", "success");
        }
      } catch (err) {
        console.error(err);
        toast(firebaseMessage(err), "error");
      } finally {
        $("authSubmit").disabled = false;
      }
    });

    $("forgotBtn").addEventListener("click", async () => {
      if (!ensureFirebaseConfigured()) return;
      const email = $("authEmail").value.trim().toLowerCase();
      if (!validEmail(email)) {
        toast("Enter a valid account email first.", "error");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        toast("Password reset email sent. Check your inbox.", "success");
      } catch (err) {
        toast(firebaseMessage(err), "error");
      }
    });

    $("switchMode").addEventListener("click", () => {
      setAuthMode(authMode === "login" ? "signup" : "login");
    });

    document.querySelectorAll(".show-pass").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = $(btn.dataset.target);
        input.type = input.type === "password" ? "text" : "password";
        btn.textContent = input.type === "password" ? "Show" : "Hide";
      });
    });

    $("startBtn").addEventListener("click", () => showView("submit"));
    $("backBtn").addEventListener("click", () => showView("dashboard"));

    $("submitForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser || !currentProfile) {
        toast("Please log in again.", "error");
        showView("auth");
        return;
      }

      const email = $("submittedEmail").value.trim().toLowerCase();
      // Keep the reference text exactly as entered; no numeric-only validation is applied.
      const referenceNumber = $("referenceNumber").value;

      if (!validEmail(email)) {
        toast("Please enter a valid email address.", "error");
        return;
      }

      if (referenceNumber.length > 1000) {
        toast("Reference text is too long. Maximum 1000 characters.", "error");
        return;
      }

      try {
        $("submitWorkBtn").disabled = true;

        // Global duplicate-email check (case-insensitive because email is normalized).
        const q = query(collection(db, "submissions"), where("emailNormalized", "==", email));
        const existing = await getDocs(q);

        if (!existing.empty) {
          toast("This email has already been submitted.", "error");
          return;
        }

        await addDoc(collection(db, "submissions"), {
          userUid: currentUser.uid,
          publicUserId: currentProfile.publicId,
          userName: currentProfile.name,
          submittedEmail: email,
          emailNormalized: email,
          referenceNumber,
          createdAt: serverTimestamp(),
          status: "submitted"
        });

        $("submitForm").reset();
        toast("Submission saved successfully.", "success");
        showView("dashboard");
      } catch (err) {
        console.error(err);
        toast(firebaseMessage(err), "error");
      } finally {
        $("submitWorkBtn").disabled = false;
      }
    });

    $("logoutBtn").addEventListener("click", async () => {
      await signOut(auth);
      currentUser = null;
      currentProfile = null;
      $("userMini").classList.add("hidden");
      $("headerAuthBtn").textContent = "Login";
      setAuthMode("login");
      showView("auth");
      toast("Logged out.");
    });

    $("headerAuthBtn").addEventListener("click", () => {
      if (currentUser) showView("dashboard");
      else showView("auth");
    });

    $("brandLink").addEventListener("click", (e) => {
      e.preventDefault();
      if (currentUser) showView("dashboard");
      else showView("auth");
    });

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        currentUser = null;
        $("userMini").classList.add("hidden");
        $("headerAuthBtn").textContent = "Login";
        setAuthMode("login");
        showView("auth");
        return;
      }

      try {
        currentUser = user;
        const profile = await loadProfile(user);
        renderProfile(profile);
        showView("dashboard");
      } catch (err) {
        console.error(err);
        toast(firebaseMessage(err), "error");
      }
    });

    function firebaseMessage(err) {
      const code = err?.code || "";
      const map = {
        "auth/email-already-in-use": "This account email is already registered.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Password is too weak. Use at least 6 characters.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/user-not-found": "No account was found with this email.",
        "auth/wrong-password": "Incorrect email or password.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "permission-denied": "Firebase permission denied. Check your Firestore rules."
      };
      return map[code] || err?.message || "Something went wrong. Please try again.";
    }

    $("year").textContent = new Date().getFullYear();
    setAuthMode("login");
