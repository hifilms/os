/* ==========================================
   1. HELPER & FALLBACK UTILITIES
   ========================================== */

// ফাইলকে Base64-এ রূপান্তর করার সেফ ফোলব্যাক
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
}

// ইমেজ কম্প্রেশন হেলপার (ফোলব্যাকসহ)
async function compressImageSafe(file, maxWidth = 800, quality = 0.7) {
    if (typeof compressImage === "function") {
        try {
            return await compressImage(file, maxWidth, quality);
        } catch (e) {
            console.warn("compressImage failed, using original file", e);
        }
    }
    return file;
}

// ImgBB বা বিকল্প আপলোড হেলপার
async function uploadImageSafe(file) {
    // ১. যদি মূল ফাংশন থাকে তবে চেষ্টা করবে
    if (typeof uploadToImgBB === "function") {
        try {
            const url = await uploadToImgBB(file);
            if (url) return url;
        } catch (err) {
            console.warn("ImgBB upload failed, falling back to Base64", err);
        }
    }
    // ২. ফোলব্যাক: ডাটা সরাসরি Base64 স্ট্রিং হিসেবে রূপান্তর
    return await fileToBase64(file);
}


/* ==========================================
   2. STATE & INITIALIZATION
   ========================================== */
let currentUser = null;
let allPostsCache = [];
let allUsersCache = [];
let activeViewingUserMobile = null;
let postsUnsubscribeListener = null;

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof initIndexedDB === "function") await initIndexedDB();
    setupEventListeners();
    setupHistoryHandling();

    const localUser = typeof getLocalUser === "function" ? await getLocalUser() : null;
    if (localUser) {
        currentUser = localUser;
        navigateTo("homePage", true);
        listenToPostsRealtime();
    } else {
        navigateTo("authPage", true);
    }
});

/* ==========================================
   3. BROWSER / MOBILE BACK BUTTON HANDLING
   ========================================== */
function setupHistoryHandling() {
    window.addEventListener("popstate", (e) => {
        if (e.state && e.state.pageId) {
            switchPageUI(e.state.pageId);
        } else {
            if (currentUser) {
                switchPageUI("homePage");
            } else {
                switchPageUI("authPage");
            }
        }
    });
}

function navigateTo(pageId, isInitial = false) {
    switchPageUI(pageId);
    
    if (!isInitial) {
        history.pushState({ pageId: pageId }, "", `#${pageId}`);
    } else {
        history.replaceState({ pageId: pageId }, "", `#${pageId}`);
    }
}

function switchPageUI(pageId) {
    const pages = ["authPage", "homePage", "profilePage", "explorePage"];
    pages.forEach((p) => {
        const el = document.getElementById(p);
        if (el) {
            if (p === pageId) el.classList.remove("hidden");
            else el.classList.add("hidden");
        }
    });

    const appHeader = document.getElementById("appHeader");
    if (appHeader) {
        if (pageId === "homePage") {
            appHeader.classList.remove("hidden");
            updateHeaderUI();
        } else {
            appHeader.classList.add("hidden");
        }
    }
}

/* ==========================================
   4. PROCESS TOAST DIALOG
   ========================================== */
function showProcessToast(message) {
    const dialog = document.getElementById("processToastDialog");
    const msgEl = document.getElementById("processToastMsg");
    if (msgEl) msgEl.textContent = message;
    if (dialog) dialog.classList.remove("hidden");
}

function hideProcessToast() {
    const dialog = document.getElementById("processToastDialog");
    if (dialog) dialog.classList.add("hidden");
}

/* ==========================================
   5. UI HEADER UPDATE
   ========================================== */
function updateHeaderUI() {
    if (currentUser) {
        const usernameEl = document.getElementById("headerUsername");
        const mobileEl = document.getElementById("headerMobile");
        if (usernameEl) usernameEl.textContent = currentUser.username;
        if (mobileEl) mobileEl.textContent = currentUser.mobileNumber;

        const imgEl = document.getElementById("headerUserImg");
        const defaultAvatar = document.getElementById("headerDefaultAvatar");

        if (imgEl && defaultAvatar) {
            if (currentUser.profilePic) {
                imgEl.src = currentUser.profilePic;
                imgEl.classList.remove("hidden");
                defaultAvatar.classList.add("hidden");
            } else {
                imgEl.classList.add("hidden");
                defaultAvatar.classList.remove("hidden");
            }
        }
    }
}

/* ==========================================
   6. BOTTOM-SHEET CONFIRMATION POPUP
   ========================================== */
function showDeleteConfirmPermission() {
    return new Promise((resolve) => {
        const overlay = document.getElementById("customModalOverlay");
        const modalTitle = document.getElementById("modalTitle");
        const modalBody = document.getElementById("modalBody");
        const modalForm = document.getElementById("modalFormContainer");
        const modalActions = document.getElementById("modalActions");

        modalTitle.textContent = "Delete Image";
        modalBody.textContent = "Are you sure you want to delete this image?";
        modalBody.classList.remove("hidden");
        modalForm.classList.add("hidden");

        modalActions.innerHTML = `
            <button class="btn secondary-btn" id="modalNoBtn">No</button>
            <button class="btn danger-btn" id="modalYesBtn">Yes</button>
        `;
        overlay.classList.remove("hidden");

        document.getElementById("modalYesBtn").onclick = () => {
            overlay.classList.add("hidden");
            resolve(true);
        };

        document.getElementById("modalNoBtn").onclick = () => {
            overlay.classList.add("hidden");
            resolve(false);
        };
    });
}

/* ==========================================
   7. EVENT LISTENERS
   ========================================== */
function setupEventListeners() {
    const authToggleBtn = document.getElementById("authToggleBtn");
    let isLoginMode = false;

    if (authToggleBtn) {
        authToggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;

            document.getElementById("authTitle").textContent = isLoginMode ? "Login" : "Register Account";
            document.getElementById("usernameGroup").classList.toggle("hidden", isLoginMode);
            document.getElementById("profilePicGroup").classList.toggle("hidden", isLoginMode);
            document.getElementById("privacyGroup").classList.toggle("hidden", isLoginMode);
            document.getElementById("authSubmitBtn").textContent = isLoginMode ? "Login" : "Register";
            document.getElementById("authToggleMsg").textContent = isLoginMode ? "Don't have an account?" : "Already registered?";
            authToggleBtn.textContent = isLoginMode ? "Register" : "Login";
        });
    }

    // Home Page Tabs
    const tabFeed = document.getElementById("tabFeed");
    const tabFollowing = document.getElementById("tabFollowing");
    
    if (tabFeed) {
        tabFeed.addEventListener("click", () => {
            tabFeed.classList.add("active");
            if (tabFollowing) tabFollowing.classList.remove("active");
            document.getElementById("feedView").classList.remove("hidden");
            document.getElementById("followingView").classList.add("hidden");
            renderPinterestGrid(allPostsCache, "pinterestGrid");
        });
    }

    if (tabFollowing) {
        tabFollowing.addEventListener("click", async () => {
            tabFollowing.classList.add("active");
            if (tabFeed) tabFeed.classList.remove("active");
            document.getElementById("followingView").classList.remove("hidden");
            document.getElementById("feedView").classList.add("hidden");

            allUsersCache = typeof getAllUsersFromFirestore === "function" ? await getAllUsersFromFirestore() : [];
            const followingMobiles = currentUser.following || [];
            const followingUsers = allUsersCache.filter((u) => followingMobiles.includes(u.mobileNumber) && (u.privacy !== "private" || u.mobileNumber === currentUser.mobileNumber));
            renderUserList(followingUsers, "followingList");
        });
    }

    // Auth Submit (FIXED REGISTRATION & UPLOAD SAFE)
    const authForm = document.getElementById("authForm");
    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const mobile = document.getElementById("authMobile").value.trim();
            const dob = document.getElementById("authDob").value;
            const username = document.getElementById("authUsername").value.trim();
            const privacy = document.getElementById("authPrivacy") ? document.getElementById("authPrivacy").value : "public";
            const profilePicInput = document.getElementById("authProfilePic") ? document.getElementById("authProfilePic").files[0] : null;

            if (!mobile || !dob) {
                alert("Please fill in Mobile and Date of Birth");
                return;
            }

            try {
                if (isLoginMode) {
                    const userFromDB = await getUserFromFirestore(mobile);
                    if (userFromDB && userFromDB.dob === dob) {
                        currentUser = userFromDB;
                        if (typeof saveLocalUser === "function") await saveLocalUser(currentUser);
                        navigateTo("homePage");
                        listenToPostsRealtime();
                    } else {
                        alert("Invalid Mobile Number or DOB!");
                    }
                } else {
                    const existingUser = typeof getUserFromFirestore === "function" ? await getUserFromFirestore(mobile) : null;
                    if (existingUser) {
                        alert("Mobile number already registered!");
                        return;
                    }

                    let uploadedPicUrl = "";
                    if (profilePicInput) {
                        showProcessToast("Uploading profile picture...");
                        const compressed = await compressImageSafe(profilePicInput, 400, 0.6);
                        uploadedPicUrl = await uploadImageSafe(compressed);
                        hideProcessToast();
                    }

                    const newUser = {
                        username: username || "User",
                        mobileNumber: mobile,
                        dob: dob,
                        privacy: privacy || "public",
                        profilePic: uploadedPicUrl || "",
                        following: []
                    };

                    if (typeof registerUserInFirestore === "function") {
                        await registerUserInFirestore(newUser);
                    } else {
                        await db.collection("users").doc(newUser.mobileNumber).set(newUser);
                    }

                    currentUser = newUser;
                    if (typeof saveLocalUser === "function") await saveLocalUser(currentUser);

                    navigateTo("homePage");
                    listenToPostsRealtime();
                }
            } catch (err) {
                hideProcessToast();
                alert("Authentication Failed: " + err.message);
                console.error(err);
            }
        });
    }

    // Navigation Buttons
    const profileBtn = document.getElementById("headerProfileBtn");
    if (profileBtn) profileBtn.addEventListener("click", () => openProfilePage(currentUser.mobileNumber));

    const exploreBtn = document.getElementById("headerExploreBtn");
    if (exploreBtn) exploreBtn.addEventListener("click", () => {
        navigateTo("explorePage");
        loadExploreData();
    });

    // Back Buttons
    const profileBackBtn = document.getElementById("profileBackBtn");
    if (profileBackBtn) profileBackBtn.addEventListener("click", () => history.back());

    const exploreBackBtn = document.getElementById("exploreBackBtn");
    if (exploreBackBtn) exploreBackBtn.addEventListener("click", () => history.back());

    // Upload Post Image (FIXED SAFE UPLOAD)
    const imageUploadInput = document.getElementById("imageUploadInput");
    if (imageUploadInput) {
        imageUploadInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                showProcessToast("Uploading image...");
                const compressedBlob = await compressImageSafe(file);
                const imageUrl = await uploadImageSafe(compressedBlob);

                const newPost = {
                    userMobile: currentUser.mobileNumber,
                    username: currentUser.username,
                    userProfilePic: currentUser.profilePic || "",
                    imageUrl: imageUrl,
                    createdAt: Date.now()
                };

                if (typeof createPostInFirestore === "function") {
                    await createPostInFirestore(newPost);
                } else {
                    await db.collection("posts").add(newPost);
                }
            } catch (err) {
                alert("Image Upload Failed!");
                console.error(err);
            } finally {
                hideProcessToast();
                e.target.value = "";
            }
        });
    }

    // Edit Profile Modal
    const editProfileBtn = document.getElementById("editProfileBtn");
    if (editProfileBtn) {
        editProfileBtn.addEventListener("click", () => {
            const overlay = document.getElementById("customModalOverlay");
            const modalTitle = document.getElementById("modalTitle");
            const modalBody = document.getElementById("modalBody");
            const modalForm = document.getElementById("modalFormContainer");
            const modalActions = document.getElementById("modalActions");

            modalTitle.textContent = "Edit Profile";
            modalBody.classList.add("hidden");
            modalForm.classList.remove("hidden");

            const currentPrivacy = currentUser.privacy || "public";

            modalForm.innerHTML = `
                <div class="input-group">
                    <label>Username</label>
                    <input type="text" id="editUsername" value="${currentUser.username}">
                </div>
                <div class="input-group">
                    <label>Date of Birth</label>
                    <input type="date" id="editDob" value="${currentUser.dob}">
                </div>
                <div class="input-group">
                    <label>Account Privacy</label>
                    <select id="editPrivacy" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 14px;">
                        <option value="public" ${currentPrivacy === 'public' ? 'selected' : ''}>Public</option>
                        <option value="private" ${currentPrivacy === 'private' ? 'selected' : ''}>Private</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Profile Picture</label>
                    <input type="file" id="editProfilePic" accept="image/*">
                </div>
            `;

            modalActions.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                    <button class="btn primary-btn" id="saveProfileModalBtn" style="padding:10px;">Save Changes</button>
                    <button class="btn secondary-btn" id="logoutModalBtn" style="padding:10px;">Logout</button>
                    <button class="btn danger-btn" id="deleteAccModalBtn" style="padding:10px;">Delete Account</button>
                    <button class="btn secondary-btn" id="closeProfileModalBtn" style="padding:10px;">Cancel</button>
                </div>
            `;

            overlay.classList.remove("hidden");

            // Save Profile Logic
            document.getElementById("saveProfileModalBtn").onclick = async () => {
                const newName = document.getElementById("editUsername").value.trim();
                const newDob = document.getElementById("editDob").value;
                const newPrivacy = document.getElementById("editPrivacy").value;
                const newPicFile = document.getElementById("editProfilePic").files[0];

                try {
                    let newPicUrl = currentUser.profilePic;
                    if (newPicFile) {
                        showProcessToast("Updating profile picture...");
                        const compressed = await compressImageSafe(newPicFile, 400, 0.6);
                        newPicUrl = await uploadImageSafe(compressed);
                        hideProcessToast();
                    }

                    const updatedData = {
                        ...currentUser,
                        username: newName || currentUser.username,
                        dob: newDob || currentUser.dob,
                        privacy: newPrivacy || "public",
                        profilePic: newPicUrl
                    };

                    if (typeof registerUserInFirestore === "function") {
                        await registerUserInFirestore(updatedData);
                    } else {
                        await db.collection("users").doc(updatedData.mobileNumber).set(updatedData);
                    }

                    if (typeof saveLocalUser === "function") await saveLocalUser(updatedData);
                    currentUser = updatedData;

                    await updatePostsProfileInfo(currentUser.mobileNumber, currentUser.username, currentUser.profilePic);

                    overlay.classList.add("hidden");

                    updateHeaderUI();
                    await openProfilePage(currentUser.mobileNumber);
                } catch (err) {
                    hideProcessToast();
                    alert("Profile Update Failed!");
                    console.error(err);
                }
            };

            // Logout
            document.getElementById("logoutModalBtn").onclick = async () => {
                if (typeof clearLocalUser === "function") await clearLocalUser();
                currentUser = null;
                if (postsUnsubscribeListener) postsUnsubscribeListener();
                overlay.classList.add("hidden");
                navigateTo("authPage");
            };

            // Delete Account
            document.getElementById("deleteAccModalBtn").onclick = async () => {
                const confirmed = await showDeleteConfirmPermission();
                if (confirmed) {
                    await db.collection("users").doc(currentUser.mobileNumber).delete();
                    if (typeof clearLocalUser === "function") await clearLocalUser();
                    currentUser = null;
                    if (postsUnsubscribeListener) postsUnsubscribeListener();
                    overlay.classList.add("hidden");
                    navigateTo("authPage");
                }
            };

            document.getElementById("closeProfileModalBtn").onclick = () => {
                overlay.classList.add("hidden");
            };
        });
    }

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            filterExploreList(e.target.value.toLowerCase().trim());
        });
    }
}

// Firestore Update
async function updatePostsProfileInfo(mobileNumber, newUsername, newProfilePic) {
    const userPosts = await db.collection("posts").where("userMobile", "==", mobileNumber).get();
    const batch = db.batch();
    userPosts.forEach((doc) => {
        batch.update(doc.ref, {
            username: newUsername,
            userProfilePic: newProfilePic
        });
    });
    await batch.commit();
}

/* ==========================================
   8. REALTIME FEED ENGINE
   ========================================== */
function listenToPostsRealtime() {
    if (postsUnsubscribeListener) postsUnsubscribeListener();

    postsUnsubscribeListener = db.collection("posts").onSnapshot(async (snapshot) => {
        const posts = [];
        snapshot.forEach((doc) => posts.push({ id: doc.id, ...doc.data() }));

        allUsersCache = typeof getAllUsersFromFirestore === "function" ? await getAllUsersFromFirestore() : [];

        // Privacy Filter: Only show post if owner is Public OR Current User
        allPostsCache = posts.filter(p => {
            if (p.userMobile === currentUser.mobileNumber) return true;
            const owner = allUsersCache.find(u => u.mobileNumber === p.userMobile);
            return owner && owner.privacy !== "private";
        }).sort((a, b) => b.createdAt - a.createdAt);

        renderPinterestGrid(allPostsCache, "pinterestGrid");

        if (activeViewingUserMobile) {
            const targetUser = allUsersCache.find(u => u.mobileNumber === activeViewingUserMobile);
            if (targetUser && (targetUser.privacy !== "private" || activeViewingUserMobile === currentUser.mobileNumber)) {
                const userPosts = posts.filter((p) => p.userMobile === activeViewingUserMobile);
                renderPinterestGrid(userPosts, "profileGallery");
            } else {
                const profileGallery = document.getElementById("profileGallery");
                if (profileGallery) {
                    profileGallery.innerHTML = '<p style="text-align:center; padding:20px; grid-column: 1/-1; color: var(--text-secondary);">This account is Private</p>';
                }
            }
        }
    });
}

function renderPinterestGrid(posts, containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = "";

    if (!posts || posts.length === 0) {
        grid.innerHTML = '<p style="text-align:center; padding:20px; grid-column: 1/-1; color: var(--text-secondary);">No images found</p>';
        return;
    }

    let displayPosts = posts;
    if (containerId === "pinterestGrid") {
        const followingList = currentUser ? (currentUser.following || []) : [];
        displayPosts = posts.filter(
            (p) => p.userMobile === currentUser.mobileNumber || followingList.includes(p.userMobile)
        );
    }

    if (displayPosts.length === 0) {
        grid.innerHTML = '<p style="text-align:center; padding:20px; grid-column: 1/-1; color: var(--text-secondary);">No images found</p>';
        return;
    }

    displayPosts.forEach((post) => {
        const pinCard = document.createElement("div");
        pinCard.className = "pin-card";

        const isMyPost = post.userMobile === currentUser.mobileNumber;
        const isProfilePage = containerId === "profileGallery";

        const avatarOverlayHTML = !isProfilePage
            ? `<button class="pin-avatar-btn" title="View Profile">
                ${
                    post.userProfilePic
                        ? `<img src="${post.userProfilePic}" class="pin-avatar-img">`
                        : `<svg class="svg-avatar" viewBox="0 0 24 24" style="width:20px;height:20px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-3.8-1.04-4.83-2.61.03-1.6 3.22-2.47 4.83-2.47s4.8 1.87 4.83 2.47C15.8 18.96 14.03 20 12 20z"/></svg>`
                }
               </button>`
            : "";

        let actionButtonsHTML = "";
        if (isProfilePage && isMyPost) {
            actionButtonsHTML = `
                <div class="pin-actions-container">
                    <button class="pin-action-btn download-btn" title="Download">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                    <button class="pin-action-btn delete-btn" title="Delete">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            `;
        } else {
            actionButtonsHTML = `
                <div class="pin-actions-container">
                    <button class="pin-action-btn download-btn" title="Download">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                </div>
            `;
        }

        pinCard.innerHTML = `
            <img src="${post.imageUrl}" class="pin-image" loading="lazy" alt="Post">
            ${avatarOverlayHTML}
            ${actionButtonsHTML}
        `;

        if (!isProfilePage) {
            const avatarBtn = pinCard.querySelector(".pin-avatar-btn");
            if (avatarBtn) avatarBtn.addEventListener("click", () => openProfilePage(post.userMobile));
        }

        const downloadBtn = pinCard.querySelector(".download-btn");
        if (downloadBtn) {
            downloadBtn.addEventListener("click", () => downloadImageDirectly(post.imageUrl));
        }

        const deleteBtn = pinCard.querySelector(".delete-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async () => {
                const confirmed = await showDeleteConfirmPermission();
                if (confirmed) {
                    if (typeof deletePostFromFirestore === "function") {
                        await deletePostFromFirestore(post.id);
                    } else {
                        await db.collection("posts").doc(post.id).delete();
                    }
                }
            });
        }

        grid.appendChild(pinCard);
    });
}

/* ==========================================
   9. PROFILE & EXPLORE LOGIC
   ========================================== */
async function openProfilePage(targetMobile) {
    activeViewingUserMobile = targetMobile;
    navigateTo("profilePage");

    const user = allUsersCache.find((u) => u.mobileNumber === targetMobile) || (typeof getUserFromFirestore === "function" ? await getUserFromFirestore(targetMobile) : null);
    if (!user) return;

    const isOwner = targetMobile === currentUser.mobileNumber;
    const isPrivate = user.privacy === "private";

    document.getElementById("profilePageName").textContent = user.username;
    document.getElementById("profilePageMobile").textContent = user.mobileNumber;

    const imgEl = document.getElementById("profilePageImg");
    const defaultAvatar = document.querySelector("#profilePageAvatar .svg-avatar");

    if (imgEl && defaultAvatar) {
        if (user.profilePic) {
            imgEl.src = user.profilePic;
            imgEl.classList.remove("hidden");
            defaultAvatar.classList.add("hidden");
        } else {
            imgEl.classList.add("hidden");
            defaultAvatar.classList.remove("hidden");
        }
    }

    const followBtn = document.getElementById("followActionBtn");
    const editBtn = document.getElementById("editProfileBtn");

    if (isOwner) {
        if (followBtn) followBtn.classList.add("hidden");
        if (editBtn) editBtn.classList.remove("hidden");
    } else {
        if (editBtn) editBtn.classList.add("hidden");
        if (followBtn) {
            followBtn.classList.remove("hidden");
            const isFollowing = (currentUser.following || []).includes(targetMobile);
            followBtn.textContent = isFollowing ? "Unfollow" : "Follow";
            followBtn.className = `btn ${isFollowing ? "secondary-btn" : "primary-btn"}`;

            followBtn.onclick = async () => {
                await toggleFollowState(targetMobile, isFollowing);
                openProfilePage(targetMobile);
            };
        }
    }

    if (isPrivate && !isOwner) {
        const profileGallery = document.getElementById("profileGallery");
        if (profileGallery) {
            profileGallery.innerHTML = '<p style="text-align:center; padding:20px; grid-column: 1/-1; color: var(--text-secondary);">This account is Private</p>';
        }
    } else {
        const userPosts = allPostsCache.filter((p) => p.userMobile === targetMobile);
        renderPinterestGrid(userPosts, "profileGallery");
    }
}

async function loadExploreData() {
    allUsersCache = typeof getAllUsersFromFirestore === "function" ? await getAllUsersFromFirestore() : [];
    renderUserList(allUsersCache, "exploreList");
}

function renderUserList(users, containerId) {
    const listContainer = document.getElementById(containerId);
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const filteredUsers = users.filter((u) => u.mobileNumber !== currentUser.mobileNumber && u.privacy !== "private");

    if (filteredUsers.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding:20px; color: var(--text-secondary);">No users found</p>';
        return;
    }

    filteredUsers.forEach((user) => {
        const item = document.createElement("div");
        item.className = "user-item";

        const isFollowing = (currentUser.following || []).includes(user.mobileNumber);

        item.innerHTML = `
            <div class="user-info-left">
                <div class="avatar-container">
                    ${
                        user.profilePic
                            ? `<img src="${user.profilePic}" class="user-avatar">`
                            : `<svg class="svg-avatar" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-3.8-1.04-4.83-2.61.03-1.6 3.22-2.47 4.83-2.47s4.8 1.87 4.83 2.47C15.8 18.96 14.03 20 12 20z"/></svg>`
                    }
                </div>
                <div class="user-text-details">
                    <span class="username-text">${user.username}</span>
                    <span class="mobile-text">${user.mobileNumber}</span>
                </div>
            </div>
            <button class="btn ${isFollowing ? "secondary-btn" : "primary-btn"} follow-btn">${isFollowing ? "Unfollow" : "Follow"}</button>
        `;

        item.querySelector(".user-info-left").addEventListener("click", () => openProfilePage(user.mobileNumber));
        item.querySelector(".follow-btn").addEventListener("click", async () => {
            await toggleFollowState(user.mobileNumber, isFollowing);
            if (containerId === "exploreList") loadExploreData();
            if (containerId === "followingList") {
                const updatedUsers = allUsersCache.filter((u) => (currentUser.following || []).includes(u.mobileNumber) && (u.privacy !== "private" || u.mobileNumber === currentUser.mobileNumber));
                renderUserList(updatedUsers, "followingList");
            }
        });

        listContainer.appendChild(item);
    });
}

function filterExploreList(query) {
    const filtered = allUsersCache.filter(
        (u) => u.privacy !== "private" && (u.username.toLowerCase().includes(query) || u.mobileNumber.includes(query))
    );
    renderUserList(filtered, "exploreList");
}

async function toggleFollowState(targetMobile, isCurrentlyFollowing) {
    if (typeof toggleFollowUser === "function") {
        await toggleFollowUser(currentUser.mobileNumber, targetMobile, isCurrentlyFollowing);
    }

    if (isCurrentlyFollowing) {
        currentUser.following = (currentUser.following || []).filter((m) => m !== targetMobile);
    } else {
        if (!currentUser.following) currentUser.following = [];
        currentUser.following.push(targetMobile);
    }

    if (typeof saveLocalUser === "function") await saveLocalUser(currentUser);
    renderPinterestGrid(allPostsCache, "pinterestGrid");
}

/* ==========================================
   10. DIRECT DOWNLOAD WITH STATUS TOAST
   ========================================== */
async function downloadImageDirectly(imageUrl) {
    try {
        showProcessToast("Downloading image...");
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.style.display = "none";
        a.href = blobUrl;
        a.download = `Photo_${Date.now()}.jpg`;

        document.body.appendChild(a);
        a.click();

        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
    } catch (err) {
        window.open(imageUrl, "_blank");
    } finally {
        hideProcessToast();
    }
}