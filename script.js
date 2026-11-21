
// =====================================
// WATER INTAKE TRACKING APPLICATION
// FIREBASE AUTHENTICATION + FIRESTORE
// =====================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =====================================
// FIREBASE CONFIGURATION
// =====================================

const firebaseConfig = {
    apiKey: "AIzaSyDCvP35Dc35uG0zYjAKw4j4ynBg1JpiP38",
    authDomain: "water-intake-tracker-15c17.firebaseapp.com",
    projectId: "water-intake-tracker-15c17",
    storageBucket: "water-intake-tracker-15c17.firebasestorage.app",
    messagingSenderId: "444933927023",
    appId: "1:444933927023:web:8c640a3b150de1a6d91d9a",
    measurementId: "G-SY2BCNVFNG"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// =====================================
// DEFAULT SETTINGS
// =====================================

const DEFAULT_GOAL = 2000;

let currentUser = null;
let pendingName = "";
let saveQueue = Promise.resolve();
let isLoadingUserData = false;

const messages = [
    "Water is essential for maintaining normal body functions.",
    "Stay hydrated to help maintain focus and concentration.",
    "Every sip is a step toward a healthier hydration habit.",
    "Make drinking water part of your everyday routine.",
    "Keep a water bottle nearby during working hours.",
    "Take regular hydration breaks throughout your workday.",
    "Water helps regulate body temperature and supports digestion.",
    "Listen to your body's thirst signals and stay refreshed.",
    "Small hydration habits can make a meaningful difference.",
    "Your health matters. Make hydration a priority."
];

const tips = [
    ["💧", "Drink water regularly throughout your working hours."],
    ["🥤", "Keep a reusable water bottle on your desk."],
    ["🍉", "Include water-rich fruits and vegetables in your meals."],
    ["⏰", "Take short hydration breaks between work tasks."],
    ["☀️", "Remember that heat and physical activity can increase fluid needs."],
    ["🌿", "Listen to your body's thirst signals."]
];

const levels = [
    {
        name: "Beginner",
        icon: "🌱",
        message: "Every hydration journey starts with one sip!",
        min: 0,
        max: 24
    },
    {
        name: "Improving",
        icon: "💧",
        message: "Great start! Keep building your hydration habit.",
        min: 25,
        max: 49
    },
    {
        name: "Active Hydrator",
        icon: "🌊",
        message: "You're making excellent progress. Keep going!",
        min: 50,
        max: 74
    },
    {
        name: "Hydration Champion",
        icon: "🏆",
        message: "Almost there! You're doing a great job.",
        min: 75,
        max: 99
    },
    {
        name: "Goal Achieved",
        icon: "🥇",
        message: "Congratulations! You've reached your daily goal!",
        min: 100,
        max: Infinity
    }
];

const achievements = [
    { percent: 25, name: "Getting Started", icon: "🌱" },
    { percent: 50, name: "Halfway There", icon: "💧" },
    { percent: 75, name: "Almost There", icon: "🏅" },
    { percent: 100, name: "Goal Achiever", icon: "🏆" }
];

// =====================================
// DEFAULT USER DATA
// =====================================

function todayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function createDefaultData() {
    return {
        date: todayString(),
        total: 0,
        goal: DEFAULT_GOAL,
        history: [],
        email: "",
        name: "User",
        unit: "ml",
        reminderStart: "09:00",
        reminderEnd: "17:00",
        reminderInterval: 60,
        remindersEnabled: false,
        reminderTimes: []
    };
}

let data = createDefaultData();

// =====================================
// FIRESTORE USER DATA
// =====================================

function getUserDocument() {
    if (!currentUser) return null;

    return doc(db, "users", currentUser.uid);
}

async function loadUserData(user) {
    isLoadingUserData = true;

    try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        const defaultData = createDefaultData();

        if (snapshot.exists()) {
            const savedData = snapshot.data();

            data = {
                ...defaultData,
                ...savedData,
                email: user.email || "",
                name: user.displayName ||
                    savedData.name ||
                    user.email.split("@")[0],
                history: Array.isArray(savedData.history)
                    ? savedData.history
                    : []
            };

            // Reset daily records when a new day begins.
            if (data.date !== todayString()) {
                data.date = todayString();
                data.total = 0;
                data.history = [];
            }

        } else {
            data = {
                ...defaultData,
                email: user.email || "",
                name: user.displayName ||
                    pendingName ||
                    user.email.split("@")[0]
            };
        }

        data.name = user.displayName || pendingName || data.name;

        await saveUserDataImmediately();

        loadSettings();
        showApplication();

    } catch (error) {
        console.error("Error loading user data:", error);

        showToast("Unable to load your data. Please try again.");

    } finally {
        isLoadingUserData = false;
    }
}

async function saveUserDataImmediately() {
    if (!currentUser) return;

    const userRef = getUserDocument();

    await setDoc(userRef, {
        ...data,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

function saveData() {
    if (!currentUser || isLoadingUserData) return;

    const dataToSave = { ...data };

    saveQueue = saveQueue
        .then(async () => {
            if (!currentUser) return;

            const userRef = getUserDocument();

            await setDoc(userRef, {
                ...dataToSave,
                updatedAt: serverTimestamp()
            }, { merge: true });
        })
        .catch(error => {
            console.error("Firestore save error:", error);
            showToast("Unable to save your data. Check your connection.");
        });
}

// =====================================
// FORMAT WATER AMOUNT
// =====================================

function formatAmount(amount) {
    if (data.unit === "oz") {
        return (amount / 29.5735).toFixed(1) + " oz";
    }

    return Math.round(amount) + " mL";
}

// =====================================
// LOGIN AND REGISTER ELEMENTS
// =====================================

const loginPage = document.getElementById("loginPage");
const registerPage = document.getElementById("registerPage");
const app = document.getElementById("app");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");

// =====================================
// SWITCH BETWEEN LOGIN AND REGISTER
// =====================================

document.getElementById("showRegister").addEventListener("click", function(e) {
    e.preventDefault();

    loginPage.classList.add("hidden");
    registerPage.classList.remove("hidden");

    loginError.textContent = "";
    registerError.textContent = "";
});

document.getElementById("showLogin").addEventListener("click", function(e) {
    e.preventDefault();

    registerPage.classList.add("hidden");
    loginPage.classList.remove("hidden");

    loginError.textContent = "";
    registerError.textContent = "";
});

// =====================================
// REGISTER ACCOUNT
// =====================================

registerForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    registerError.textContent = "";

    if (!name || !email || !password || !confirmPassword) {
        registerError.textContent = "Please complete all fields.";
        return;
    }

    if (password.length < 6) {
        registerError.textContent = "Password must contain at least 6 characters.";
        return;
    }

    if (password !== confirmPassword) {
        registerError.textContent = "Passwords do not match.";
        return;
    }

    const submitButton = registerForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Creating Account...";

    try {
        pendingName = name;

        const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        await updateProfile(userCredential.user, {
            displayName: name
        });

        currentUser = userCredential.user;

        data = {
            ...createDefaultData(),
            name: name,
            email: email
        };

        await saveUserDataImmediately();

        pendingName = "";

        registerForm.reset();

        showApplication();
        showToast("Account created successfully!");

    } catch (error) {
        console.error("Registration error:", error);

        registerError.textContent = getAuthErrorMessage(error);

        pendingName = "";

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Register";
    }
});

// =====================================
// LOGIN ACCOUNT
// =====================================

loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginError.textContent = "";

    if (!email || !password) {
        loginError.textContent = "Please enter your email and password.";
        return;
    }

    const submitButton = loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Logging In...";

    try {
        await signInWithEmailAndPassword(auth, email, password);

        loginForm.reset();

        showToast("Welcome back!");

    } catch (error) {
        console.error("Login error:", error);

        loginError.textContent = getAuthErrorMessage(error);

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Log In";
    }
});

// =====================================
// FIREBASE AUTHENTICATION ERROR MESSAGES
// =====================================

function getAuthErrorMessage(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "This email is already registered.";

        case "auth/invalid-email":
            return "Please enter a valid email address.";

        case "auth/weak-password":
            return "Password must contain at least 6 characters.";

        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Incorrect email or password.";

        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";

        case "auth/network-request-failed":
            return "Network error. Please check your internet connection.";

        default:
            return error.message || "Something went wrong. Please try again.";
    }
}

// =====================================
// RESTORE LOGIN SESSION
// =====================================

onAuthStateChanged(auth, async function(user) {
    if (user) {
        currentUser = user;

        loginPage.classList.add("hidden");
        registerPage.classList.add("hidden");

        await loadUserData(user);

    } else {
        currentUser = null;
        data = createDefaultData();

        app.classList.add("hidden");
        registerPage.classList.add("hidden");
        loginPage.classList.remove("hidden");

        if (window.reminderTimer) {
            clearInterval(window.reminderTimer);
        }
    }
});

// =====================================
// SHOW APPLICATION
// =====================================

function showApplication() {
    loginPage.classList.add("hidden");
    registerPage.classList.add("hidden");
    app.classList.remove("hidden");

    document.getElementById("headerName").textContent = data.name;
    document.getElementById("welcomeName").textContent = data.name;
    document.getElementById("profileName").textContent = data.name;
    document.getElementById("profileEmail").textContent = data.email;

    loadSettings();
    renderAll();
    startReminderChecker();
}

// =====================================
// LOG OUT / SIGN OUT
// =====================================

document.getElementById("logoutBtn").addEventListener("click", async function() {
    try {
        await saveQueue;

        await signOut(auth);

        loginForm.reset();
        registerForm.reset();

        loginError.textContent = "";
        registerError.textContent = "";

        showToast("You have signed out.");

    } catch (error) {
        console.error("Sign out error:", error);
        showToast("Unable to sign out. Please try again.");
    }
});

// =====================================
// ADD WATER
// =====================================

function addWater(amount, container) {
    if (!currentUser) {
        showToast("Please log in first.");
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Please enter a valid amount.");
        return;
    }

    const previousPercent = Math.floor(
        (data.total / data.goal) * 100
    );

    data.total += amount;

    const record = {
        amount: amount,
        container: container,
        time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        }),
        timestamp: Date.now()
    };

    data.history.unshift(record);

    saveData();
    renderAll();

    const newPercent = Math.floor(
        (data.total / data.goal) * 100
    );

    const unlocked = achievements.filter(a =>
        previousPercent < a.percent && newPercent >= a.percent
    );

    if (unlocked.length > 0) {
        showToast(
            "Achievement unlocked: " +
            unlocked.map(a => a.name).join(", ")
        );
    } else {
        showToast(formatAmount(amount) + " added successfully!");
    }
}

// QUICK ADD BUTTONS

document.querySelectorAll(".water-btn").forEach(button => {
    button.addEventListener("click", function() {
        const amount = Number(this.dataset.amount);
        const container = this.dataset.container;

        addWater(amount, container);
    });
});

// CUSTOM WATER

document.getElementById("customAddBtn").addEventListener("click", function() {
    const input = document.getElementById("customAmount");
    const amount = Number(input.value);

    if (!Number.isInteger(amount) || amount <= 0) {
        showToast("Enter a valid water amount in mL.");
        return;
    }

    addWater(amount, "Custom Entry");
    input.value = "";
});

// =====================================
// UPDATE DAILY DASHBOARD
// =====================================

function updateDashboard() {
    const percent = Math.floor((data.total / data.goal) * 100);
    const remaining = Math.max(data.goal - data.total, 0);
    const glasses = Math.floor(data.total / 250);

    document.getElementById("percentage").textContent =
        percent + "%";

    document.getElementById("totalIntake").textContent =
        formatAmount(data.total);

    document.getElementById("dailyGoal").textContent =
        formatAmount(data.goal);

    document.getElementById("remaining").textContent =
        formatAmount(remaining);

    document.getElementById("glasses").textContent = glasses;

    document.getElementById("mainProgress").style.width =
        Math.min(percent, 100) + "%";

    const circle = document.getElementById("circleProgress");

    circle.style.background =
        `conic-gradient(#168bd2 ${Math.min(percent, 100)}%, #eaf2f6 0%)`;

    document.getElementById("progressCaption").textContent =
        percent >= 100
            ? "Congratulations! You reached your daily goal!"
            : formatAmount(remaining) + " remaining to reach your goal.";

    updateLevel(percent);
}

// =====================================
// HYDRATION LEVELS
// =====================================

function updateLevel(percent) {
    const currentLevel = levels.find(level =>
        percent >= level.min && percent <= level.max
    );

    document.getElementById("levelIcon").textContent =
        currentLevel.icon;

    document.getElementById("levelName").textContent =
        "Level " + (levels.indexOf(currentLevel) + 1) +
        " - " + currentLevel.name;

    document.getElementById("levelMessage").textContent =
        currentLevel.message;

    document.getElementById("levelList").innerHTML =
        levels.map((level, index) => `
            <div class="level-item ${level === currentLevel ? "active" : ""}">
                <span class="level-dot"></span>
                <span>Level ${index + 1}: ${level.name}</span>
            </div>
        `).join("");
}

// =====================================
// HYDRATION MESSAGES
// =====================================

let messageIndex = 0;

function changeMessage() {
    messageIndex = (messageIndex + 1) % messages.length;

    document.getElementById("hydrationMessage").textContent =
        messages[messageIndex];
}

document.getElementById("nextMessage").addEventListener("click", changeMessage);

// =====================================
// HYDRATION TIPS
// =====================================

function renderTips() {
    document.getElementById("tipsContainer").innerHTML =
        tips.map(tip => `
            <div class="tip-item">
                <span>${tip[0]}</span>
                ${tip[1]}
            </div>
        `).join("");
}

// =====================================
// ACHIEVEMENTS
// =====================================

function renderAchievements() {
    const percent = (data.total / data.goal) * 100;

    document.getElementById("achievementContainer").innerHTML =
        achievements.map(item => {
            const unlocked = percent >= item.percent;

            return `
                <div class="achievement ${unlocked ? "unlocked" : ""}">
                    <span>${item.icon}</span>
                    <strong>${item.name}</strong>
                    <small>${item.percent}% Goal</small>
                    <small>${unlocked ? "Unlocked ✓" : "Locked"}</small>
                </div>
            `;
        }).join("");
}

// =====================================
// WORKDAY SCHEDULE
// =====================================

function getSchedule() {
    const start = data.reminderStart || "09:00";
    const end = data.reminderEnd || "17:00";
    const interval = Number(data.reminderInterval) || 60;

    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    if (endMinutes <= startMinutes) {
        return [];
    }

    const schedule = [];

    for (let time = startMinutes; time < endMinutes; time += interval) {
        schedule.push(minutesToTime(time));
    }

    return schedule;
}

function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function renderSchedule() {
    const schedule = getSchedule();
    const container = document.getElementById("scheduleContainer");

    if (!schedule.length) {
        container.innerHTML =
            '<p class="empty-state">Please set a valid workday schedule in Profile.</p>';
        return;
    }

    container.innerHTML = schedule.map((time, index) => `
        <div class="schedule-item">
            <div class="schedule-time">${time}</div>
            <div class="schedule-icon">💧</div>
            <div class="schedule-description">
                <strong>Hydration Break ${index + 1}</strong>
                <small>Take a moment to drink water.</small>
            </div>
            <button data-schedule-time="${time}">Done</button>
        </div>
    `).join("");

    container.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", function() {
            addWater(250, "Scheduled Glass");
        });
    });
}

// =====================================
// WATER INTAKE HISTORY
// =====================================

function renderHistory() {
    const container = document.getElementById("historyContainer");

    if (data.history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                💧<br><br>
                No water intake recorded yet.<br>
                Start tracking your hydration today!
            </div>
        `;
        return;
    }

    container.innerHTML = data.history.map(record => `
        <div class="history-item">
            <div class="history-icon">💧</div>

            <div class="history-info">
                <strong>${record.container}</strong>
                <small>${record.time}</small>
            </div>

            <div class="history-amount">
                +${formatAmount(record.amount)}
            </div>
        </div>
    `).join("");
}

// CLEAR HISTORY

document.getElementById("clearHistory").addEventListener("click", function() {
    if (!currentUser) return;

    if (!confirm("Are you sure you want to clear today's water history?")) {
        return;
    }

    data.total = 0;
    data.history = [];

    saveData();
    renderAll();

    showToast("Today's records have been cleared.");
});

// =====================================
// PROFILE AND SETTINGS
// =====================================

function loadSettings() {
    document.getElementById("goalInput").value = data.goal;

    document.getElementById("reminderStart").value =
        data.reminderStart;

    document.getElementById("reminderEnd").value =
        data.reminderEnd;

    document.getElementById("reminderInterval").value =
        data.reminderInterval;

    document.getElementById("remindersEnabled").checked =
        data.remindersEnabled;

    document.getElementById("unitSelect").value =
        data.unit;
}

// SAVE DAILY GOAL

document.getElementById("saveGoal").addEventListener("click", function() {
    const goal = Number(document.getElementById("goalInput").value);

    if (!Number.isInteger(goal) || goal < 1 || goal > 10000) {
        showToast("Enter a goal between 1 and 10,000 mL.");
        return;
    }

    data.goal = goal;

    saveData();
    renderAll();

    showToast("Daily water goal updated!");
});

// SAVE REMINDERS

document.getElementById("saveReminders").addEventListener("click", async function() {
    const start = document.getElementById("reminderStart").value;
    const end = document.getElementById("reminderEnd").value;

    const interval = Number(
        document.getElementById("reminderInterval").value
    );

    if (!start || !end || timeToMinutes(end) <= timeToMinutes(start)) {
        showToast("Please enter a valid workday schedule.");
        return;
    }

    const enabled = document.getElementById("remindersEnabled").checked;

    if (enabled && !("Notification" in window)) {
        showToast("Browser notifications are not supported.");
        return;
    }

    if (enabled && Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
            showToast("Notification permission was not granted.");
            return;
        }
    }

    data.reminderStart = start;
    data.reminderEnd = end;
    data.reminderInterval = interval;
    data.remindersEnabled = enabled;

    saveData();
    renderSchedule();
    startReminderChecker();

    showToast("Reminder settings saved!");
});

// SAVE MEASUREMENT PREFERENCE

document.getElementById("saveUnit").addEventListener("click", function() {
    data.unit = document.getElementById("unitSelect").value;

    saveData();
    renderAll();

    showToast("Measurement preference updated!");
});

// =====================================
// BROWSER REMINDERS
// =====================================

let lastReminderKey = "";

function startReminderChecker() {
    if (window.reminderTimer) {
        clearInterval(window.reminderTimer);
    }

    if (!data.remindersEnabled || !currentUser) {
        return;
    }

    window.reminderTimer = setInterval(() => {
        const now = new Date();

        const currentTime = minutesToTime(
            now.getHours() * 60 + now.getMinutes()
        );

        const key = todayString() + "-" + currentTime;

        if (
            getSchedule().includes(currentTime) &&
            key !== lastReminderKey &&
            Notification.permission === "granted"
        ) {
            lastReminderKey = key;

            new Notification("Hydration Reminder 💧", {
                body: "Take a short break and drink some water!"
            });
        }
    }, 15000);
}

// =====================================
// BOTTOM NAVIGATION
// =====================================

const pages = {
    home: "homeSection",
    workday: "workdaySection",
    history: "historySection",
    profile: "profileSection"
};

document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", function() {
        const page = this.dataset.page;

        Object.values(pages).forEach(id => {
            document.getElementById(id).classList.add("hidden");
        });

        document.getElementById(pages[page]).classList.remove("hidden");

        document.querySelectorAll(".nav-btn").forEach(nav => {
            nav.classList.remove("active");
        });

        this.classList.add("active");

        if (page === "history") {
            renderHistory();
        }

        if (page === "workday") {
            renderSchedule();
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

// =====================================
// DATE AND GENERAL DISPLAY
// =====================================

function updateDate() {
    document.getElementById("todayDate").textContent =
        new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric"
        });
}

// =====================================
// TOAST MESSAGE
// =====================================

let toastTimer;

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

// =====================================
// RENDER EVERYTHING
// =====================================

function renderAll() {
    updateDate();
    updateDashboard();
    renderTips();
    renderAchievements();
    renderHistory();
    renderSchedule();
}
