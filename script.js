// ===== Navigation =====
function showHome() {
    document.querySelector('.container').style.display = 'block';
    hideAllPages();
}

function showProfile() {
    document.querySelector('.container').style.display = 'none';
    hideAllPages();
    document.getElementById('profilePage').classList.add('show');
    loadProfile();
}

function showGarage() {
    document.querySelector('.container').style.display = 'none';
    hideAllPages();
    document.getElementById('garagePage').classList.add('show');
    loadGarage();
}

function showAddVehicleForm() {
    hideAllPages();
    document.getElementById('addVehicleForm').classList.add('show');
}

function showRidePage() {
    hideAllPages();
    document.querySelector('.container').style.display = 'none';
    document.getElementById('ridePage').classList.add('show');
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('show');
    });
}

// ===== localStorage helpers =====
function saveToStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function loadFromStorage(key) {
    return JSON.parse(localStorage.getItem(key)) || {};
}

// ===== API (Railway backend) =====
const API_BASE = 'https://riderverse-backend-production.up.railway.app';

// ===== Profile =====
function loadProfile() {
    const profile = loadFromStorage('profile');
    document.getElementById('name').value = profile.name || '';
    document.getElementById('city').value = profile.city || '';
    document.getElementById('bio').value = profile.bio || '';
}

document.getElementById('profileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const profile = {
        name: document.getElementById('name').value,
        city: document.getElementById('city').value,
        bio: document.getElementById('bio').value
    };
    saveToStorage('profile', profile);

    document.getElementById('profileDisplay').innerHTML = `
        <div class="vehicle">
            <h3>✅ Profile Saved!</h3>
            <p><strong>${profile.name}</strong> from ${profile.city}</p>
            <p>${profile.bio}</p>
        </div>
    `;
    document.getElementById('profileDisplay').classList.remove('hidden');
    document.getElementById('profileForm').style.display = 'none';
});

// ===== Helpers for formatting =====
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function formatDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleString();
}

// ===== Strava import (calls Railway) =====
async function importStravaRides() {
    try {
        const res = await fetch(`${API_BASE}/api/my-activities`, {
            credentials: 'include'
        });

        if (!res.ok) {
            alert('Error fetching Strava data. Is backend running?');
            return;
        }

        const activities = await res.json();

        const garage = loadFromStorage('garage');
        if (!garage.ridesStrava) garage.ridesStrava = [];

        garage.ridesStrava = activities.map(act => ({
            id: act.id,
            name: act.name,
            date: act.start_date_local,
            distanceKm: (act.distance / 1000).toFixed(2),
            movingTime: act.moving_time,
            avgSpeedKmh: (act.average_speed * 3.6).toFixed(1),
            maxSpeedKmh: act.max_speed ? (act.max_speed * 3.6).toFixed(1) : null
        }));

        saveToStorage('garage', garage);
        loadGarage();
        alert('Strava rides updated!');
    } catch (e) {
        console.error(e);
        alert('Failed to import Strava rides (check console).');
    }
}

// ===== Garage (vehicles + rides) =====
function loadGarage() {
    const garage = loadFromStorage('garage');
    const content = document.getElementById('garageContent');
    content.innerHTML = '';

    // Vehicles
    if (garage.vehicles && garage.vehicles.length > 0) {
        content.innerHTML += `
            <div class="section-title">
                🚗 Vehicles
            </div>
        `;
        garage.vehicles.forEach(vehicle => {
            content.innerHTML += `
                <div class="vehicle">
                    <h4>${vehicle.type === 'bike' ? '🏍️' : '🚗'} ${vehicle.nickname}</h4>
                    <p>${vehicle.brand} ${vehicle.model}</p>
                </div>
            `;
        });
    }

    // Strava rides (read-only)
    if (garage.ridesStrava && garage.ridesStrava.length > 0) {
        content.innerHTML += `
            <div class="section-title">
                🚴 Strava Rides <span>(from your Strava account)</span>
            </div>
        `;
        garage.ridesStrava.forEach(ride => {
            content.innerHTML += `
                <div class="vehicle">
                    <p><strong>${ride.name}</strong></p>
                    <p>${formatDate(ride.date)}</p>
                    <p>${ride.distanceKm}km in ${formatTime(ride.movingTime)}
                    (Avg: ${ride.avgSpeedKmh}km/h${ride.maxSpeedKmh ? ', Max: ' + ride.maxSpeedKmh + 'km/h' : ''})</p>
                </div>
            `;
        });
    }

    // Past rides: show both logics
    if (garage.rides && garage.rides.length > 0) {
        content.innerHTML += `
            <div class="section-title">
                📊 Past Rides <span>(tracked in RiderVerse)</span>
            </div>
        `;
        garage.rides.slice(-10).reverse().forEach(ride => {
            content.innerHTML += `
                <div class="vehicle">
                    <p><strong>${ride.date}</strong> • ${ride.time}</p>
                    <p>Old: ${ride.distanceOld}km (Avg: ${ride.avgSpeedOld}km/h, Max: ${ride.maxSpeedOld}km/h)</p>
                    <p>New: ${ride.distanceNew}km (Avg: ${ride.avgSpeedNew}km/h, Max: ${ride.maxSpeedNew}km/h)</p>
                </div>
            `;
        });
    }

    if ((!garage.vehicles || garage.vehicles.length === 0) &&
        (!garage.rides || garage.rides.length === 0) &&
        (!garage.ridesStrava || garage.ridesStrava.length === 0)) {
        content.innerHTML = '<p>No vehicles or rides yet!</p>';
    }
}

document.getElementById('vehicleForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const garage = loadFromStorage('garage');
    if (!garage.vehicles) garage.vehicles = [];

    garage.vehicles.push({
        type: document.getElementById('type').value,
        brand: document.getElementById('brand').value,
        model: document.getElementById('model').value,
        nickname: document.getElementById('nickname').value
    });

    saveToStorage('garage', garage);
    showGarage();
});

// ===== GPS Ride Tracking (old + new logic) =====
let watchId = null;
let rideStartTime = 0;

// OLD logic
let totalDistance = 0;     // meters
let lastPosition = null;
let ridePositions = [];

// NEW (experimental) logic
let newTotalDistance = 0;  // meters
let newRidePositions = [];
let newLastPosition = null;

function startRide() {
    if (!navigator.geolocation) {
        alert('GPS not supported in this browser');
        return;
    }

    document.getElementById('startRideBtn').classList.add('hidden');
    document.getElementById('stopRideBtn').classList.remove('hidden');
    document.getElementById('rideStats').classList.remove('hidden');

    rideStartTime = Date.now();

    // reset OLD
    totalDistance = 0;
    ridePositions = [];
    lastPosition = null;

    // reset NEW
    newTotalDistance = 0;
    newRidePositions = [];
    newLastPosition = null;

    watchId = navigator.geolocation.watchPosition(
        updateRideStats,
        gpsError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 10000
        }
    );
}

function stopRide() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    document.getElementById('startRideBtn').classList.remove('hidden');
    document.getElementById('stopRideBtn').classList.add('hidden');
}

// Combined OLD + NEW logic in one handler
function updateRideStats(position) {
    const now = Date.now();
    const coords = position.coords;

    // ---------- OLD LOGIC (what UI shows) ----------
    if (lastPosition) {
        const distanceOld = calculateDistance(
            lastPosition.coords.latitude, lastPosition.coords.longitude,
            coords.latitude, coords.longitude
        );
        totalDistance += distanceOld;
        ridePositions.push({
            lat: coords.latitude,
            lng: coords.longitude,
            time: now,
            speed: (coords.speed || 0) * 3.6
        });
    } else {
        ridePositions.push({
            lat: coords.latitude,
            lng: coords.longitude,
            time: now,
            speed: (coords.speed || 0) * 3.6
        });
    }

    lastPosition = position;

    const speedKmhOld = coords.speed ? Math.round(coords.speed * 3.6) : 0;
    document.getElementById('liveSpeed').textContent = speedKmhOld;
    document.getElementById('totalDistance').textContent =
        (totalDistance / 1000).toFixed(2);
    const elapsedOld = Math.floor((now - rideStartTime) / 1000);
    document.getElementById('rideTime').textContent = formatTime(elapsedOld);

    // ---------- NEW LOGIC (experimental) ----------
    let instantSpeedNew = 0; // km/h

    if (newLastPosition) {
        const prevTime = newLastPosition.timestamp || (now - 1000);
        const dt = (now - prevTime) / 1000;

        const distanceNew = calculateDistance(
            newLastPosition.coords.latitude, newLastPosition.coords.longitude,
            coords.latitude, coords.longitude
        );

        if (dt > 0) {
            instantSpeedNew = (distanceNew / dt) * 3.6;
        }

        if (distanceNew > 2 && instantSpeedNew < 180) {
            newTotalDistance += distanceNew;
            newRidePositions.push({
                lat: coords.latitude,
                lng: coords.longitude,
                time: now,
                speed: instantSpeedNew
            });
        }
    } else {
        newRidePositions.push({
            lat: coords.latitude,
            lng: coords.longitude,
            time: now,
            speed: 0
        });
    }

    newLastPosition = {
        coords,
        timestamp: now
    };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function gpsError(error) {
    alert('GPS Error: ' + error.message);
    stopRide();
}

// Save ride summary with both logics
function saveRide() {
    const garage = loadFromStorage('garage');
    if (!garage.rides) garage.rides = [];

    const elapsedSeconds = (Date.now() - rideStartTime) / 1000;

    // OLD summary
    const distanceKmOld = totalDistance / 1000;
    const timeHoursOld = elapsedSeconds / 3600;
    const avgSpeedOld = timeHoursOld > 0 ? distanceKmOld / timeHoursOld : 0;
    const speedsOld = ridePositions.map(p => p.speed || 0);
    const rawMaxOld = speedsOld.length ? Math.max(...speedsOld) : 0;
    const maxSpeedOld = Math.min(rawMaxOld, 200);

    // NEW summary
    const distanceKmNew = newTotalDistance / 1000;
    const timeHoursNew = elapsedSeconds / 3600;
    const avgSpeedNew = timeHoursNew > 0 ? distanceKmNew / timeHoursNew : 0;
    const speedsNew = newRidePositions.map(p => p.speed || 0);
    const rawMaxNew = speedsNew.length ? Math.max(...speedsNew) : 0;
    const maxSpeedNew = Math.min(rawMaxNew, 200);

    garage.rides.push({
        date: new Date().toLocaleDateString(),
        distanceOld: distanceKmOld.toFixed(2),
        avgSpeedOld: avgSpeedOld.toFixed(1),
        maxSpeedOld: maxSpeedOld.toFixed(0),
        distanceNew: distanceKmNew.toFixed(2),
        avgSpeedNew: avgSpeedNew.toFixed(1),
        maxSpeedNew: maxSpeedNew.toFixed(0),
        time: formatTime(Math.round(elapsedSeconds))
    });

    saveToStorage('garage', garage);
    stopRide();
    alert('Ride saved! Check your Garage.');
}
