import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, db } from '@/configs/FirebaseConfig';
import { doc, setDoc, getDoc, getDocs, collection, arrayUnion, updateDoc } from 'firebase/firestore';
import { Platform, ToastAndroid, Alert } from 'react-native';
import { Badge, UserProf } from '@/types/data';
import { isAdmin } from '@/constants/AdminConfig';

interface AuthState {
  isAuthenticated: boolean;
  isGuest: boolean;
  user: UserProf | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => void;
  createUser: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => void;
  fetchUserData: (userId: string) => Promise<void>;
  updateAvatar: (avatar: string) => void;
  getAllUsers: () => Promise<UserProf[]>;
  updateProgress: (lessonId: string) => void;
  addHeart: () => Promise<boolean>; // Returns true if heart was added
  removeHeart: () => Promise<boolean>; // Returns true if heart was removed
}

// Guest user profile
const GUEST_USER: UserProf = {
  name: 'אורח',
  email: 'guest@local',
  gems: 0,
  hearts: 5,
  streak: Date.now(),
  badges: [],
  avatar: 'https://robohash.org/guest',
  progress: [],
  xp: 0,
};

/**
 * Auth store for managing authentication state.
 *
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated - Indicates if the user is authenticated.
 * @property {boolean} isGuest - Indicates if the user is in guest mode.
 * @property {UserProf | null} user - The authenticated user's profile data.
 * @property {string | null} token - The authentication token.
 * @property {boolean} loading - Indicates if an authentication-related operation is in progress.
 *
 * @function login
 * @async
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @description Authenticates the user with the provided email and password.
 * Sets the loading state to true during the process and updates the store with the user's authentication state upon success or failure.
 *
 * @function loginAsGuest
 * @description Logs in as a guest user without authentication.
 * Guest progress is stored locally and not synced to Firebase.
 *
 * @function createUser
 * @async
 * @param {string} email - The new user's email address.
 * @param {string} password - The new user's password.
 * @param {string} fullName - The new user's full name.
 * @description Creates a new user with the provided email, password, and full name.
 * Sets the loading state to true during the process and updates the store with the user's authentication state upon success or failure.
 *
 * @function logout
 * @description Logs out the current user.
 * Sets the loading state to true during the process and updates the store to reflect the user's logged-out state.
 *
 * @function fetchUserData
 * @async
 * @param {string} userId - The ID of the user whose data is to be fetched.
 * @description Fetches the profile data of the user with the provided ID.
 * Sets the loading state to true during the process and updates the store with the user's profile data upon success or failure.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Start as guest by default
      isAuthenticated: true,
      isGuest: true,
      user: GUEST_USER,
      loading: false,

      loginAsGuest: () => {
        set({
          isAuthenticated: true,
          isGuest: true,
          user: { ...GUEST_USER },
          loading: false,
        });
      },

      login: async (email, password) => {
        set({ loading: true }); // Set loading to true when login starts
        try {
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password,
          );
          const user = userCredential.user;

          set({
            isAuthenticated: true,
            isGuest: false,
            loading: false, // Set loading to false when login is successful
          });

          await useAuthStore.getState().fetchUserData(user.uid);
        } catch (error: any) {
          console.error('Login failed:', error);
          const errorMsg = error.message || 'שגיאה בהתחברות';
          if (Platform.OS === 'android') {
            ToastAndroid.show(errorMsg, ToastAndroid.LONG);
          } else {
            Alert.alert('שגיאה', errorMsg);
          }
          set({ loading: false });
        }
      },

      getAllUsers: async () => {
        set({ loading: true }); // Set loading to true while fetching users
        try {
          const usersCollection = collection(db, 'users');
          const querySnapshot = await getDocs(usersCollection);

          const users = querySnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
          })) as UserProf[];

          console.log('Fetched all users:', users);

          // If needed, you can update the state to store all users
          set({ loading: false }); // Set loading to false after fetching
          return users; // Return the users
        } catch (error) {
          console.error('Error fetching all users:', error);
          set({ loading: false }); // Set loading to false in case of error
          return []; // Return an empty array on error
        }
      },

      createUser: async (email, password, fullName) => {
        set({ loading: true }); // Set loading to true when creating a new user
        try {
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password,
          );
          const user = userCredential.user;

          const today = new Date();
          const userData: UserProf = {
            name: fullName,
            email,
            gems: 0,
            hearts: 5,
            streak: Date.now(),
            badges: [],
            avatar: `https://robohash.org/${fullName}`,
            progress: [],
            xp: 0,
          };

          console.log('Adding user to Firestore:', userData);

          await setDoc(doc(db, 'users', user.uid), userData);
          console.log('User successfully added to Firestore');

          set({
            isAuthenticated: true,
            isGuest: false,
            user: userData,
            loading: false, // Set loading to false after account creation
          });

          if (Platform.OS === 'android' || Platform.OS === 'ios') {
            ToastAndroid.show('Account created successfully!', ToastAndroid.LONG);
          } else {
            alert('Account created successfully!');
          }
        } catch (error: any) {
          console.error('Account creation failed:', error.message);
          if (Platform.OS === 'android' || Platform.OS === 'ios') {
            ToastAndroid.show(error.message, ToastAndroid.LONG);
          } else {
            alert(error.message);
          }
          set({ loading: false }); // Set loading to false if account creation fails
        }
      },

      logout: () => {
        set({ loading: true }); // Set loading to true during logout
        auth.signOut();
        // Return to guest mode instead of logged out
        set({
          isAuthenticated: true,
          isGuest: true,
          user: { ...GUEST_USER },
          loading: false
        });
        console.log('User logged out, returned to guest mode');
      },

      fetchUserData: async (userId) => {
        set({ loading: true }); // Set loading to true while fetching user data
        try {
          const docRef = doc(db, 'users', userId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const userData = docSnap.data() as UserProf;

            // Safely handle badges
            let badgeDetails: any[] = [];
            if (Array.isArray(userData.badges) && userData.badges.length > 0) {
              const validBadgeIds = userData.badges.filter((id) => typeof id === 'string'); // Ensure badge IDs are strings
              const badgeRefs = validBadgeIds.map((badgeId) =>
                getDoc(doc(db, 'badges', badgeId))
              );

              const badgeSnapshots = await Promise.all(badgeRefs);
              badgeDetails = badgeSnapshots
                .filter((snapshot) => snapshot.exists())
                .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
            }

            // Merge badge details with user data
            const userWithBadges = {
              ...userData,
              badges: badgeDetails,
            };

            set({ user: userWithBadges, loading: false }); // Set loading to false after fetching user data
          } else {
            console.log('No such document!');
            set({ user: null, loading: false }); // Set loading to false if no user data is found
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          set({ user: null, loading: false }); // Set loading to false in case of error
        }
      },



      updateAvatar: async (avatar: string) => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) return;

        const userId = auth.currentUser?.uid;
        if (!userId) {
          console.error('User ID not found');
          return;
        }

        try {
          // Update the avatar in Firestore
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, { avatar }, { merge: true });

          // Update the local store
          set({ user: { ...currentUser, avatar } });

          // Use ToastAndroid only on Android
          if (Platform.OS === 'android') {
            ToastAndroid.show('Avatar updated successfully!', ToastAndroid.LONG);
          } else {
            alert('Avatar updated successfully!');
          }
        } catch (error: any) {
          console.error('Failed to update avatar:', error);

          // Use ToastAndroid only on Android
          if (Platform.OS === 'android') {
            ToastAndroid.show('Failed to update avatar', ToastAndroid.LONG);
          } else {
            alert('Failed to update avatar');
          }
        }
      },

      updateProgress: async (lessonId: string) => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) {
          console.error('No current user found.');
          return;
        }

        if (currentUser.progress?.includes(lessonId)) return;

        const userId = auth.currentUser?.uid;
        if (!userId) {
          console.error('User ID not found. Is the user authenticated?');
          return;
        }

        try {
          console.log('Updating progress for User ID:', userId);
          console.log('Adding Lesson ID:', lessonId);

          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            gems: currentUser.gems + 50,
            progress: [...(currentUser.progress || []), lessonId],
          }, { merge: true });

          console.log('Firestore update successful. Updating local state...');
          set({
            user: {
              ...currentUser,
              progress: [...(currentUser.progress || []), lessonId],
              gems: currentUser.gems + 50,
            },
          });

          // Show toast or alert based on the platform
          if (Platform.OS === 'android') {
            ToastAndroid.show('Progress updated successfully!', ToastAndroid.LONG);
          } else {
            Alert.alert('Success', 'Progress updated successfully!');
          }
        } catch (error: any) {
          console.error('Failed to update progress:', error.message);

          // Show error toast or alert based on the platform
          if (Platform.OS === 'android') {
            ToastAndroid.show(`Failed: ${error.message}`, ToastAndroid.LONG);
          } else {
            Alert.alert('Error', `Failed to update progress: ${error.message}`);
          }
        }
      },

      addHeart: async () => {
        const currentUser = useAuthStore.getState().user;
        const isGuest = useAuthStore.getState().isGuest;

        if (!currentUser) {
          console.log('No current user found.');
          return false;
        }

        // Check if hearts are already at max (5)
        if (currentUser.hearts >= 5) {
          console.log('Hearts already at maximum (5)');
          return false;
        }

        const newHearts = currentUser.hearts + 1;

        // Update local state
        set({
          user: {
            ...currentUser,
            hearts: newHearts,
          },
        });

        // If not guest, update Firestore
        if (!isGuest) {
          const userId = auth.currentUser?.uid;
          if (userId) {
            try {
              const userRef = doc(db, 'users', userId);
              await setDoc(userRef, { hearts: newHearts }, { merge: true });
              console.log('Heart added successfully! New count:', newHearts);
            } catch (error: any) {
              console.error('Failed to update hearts in Firestore:', error);
            }
          }
        }

        return true;
      },

      removeHeart: async () => {
        const currentUser = useAuthStore.getState().user;
        const isGuest = useAuthStore.getState().isGuest;

        console.log('removeHeart called! Current user:', currentUser?.name, 'Hearts:', currentUser?.hearts);

        if (!currentUser) {
          console.log('No current user found.');
          return false;
        }

        // Admins have infinite hearts - never remove
        if (isAdmin(currentUser.email)) {
          console.log('Admin user - infinite hearts, skipping removal');
          return true;
        }

        // Check if hearts are already at 0
        if (currentUser.hearts <= 0) {
          console.log('Hearts already at minimum (0)');
          return false;
        }

        const newHearts = currentUser.hearts - 1;
        console.log('Updating hearts from', currentUser.hearts, 'to', newHearts);

        // Update local state
        set({
          user: {
            ...currentUser,
            hearts: newHearts,
          },
        });

        // If not guest, update Firestore
        if (!isGuest) {
          const userId = auth.currentUser?.uid;
          if (userId) {
            try {
              const userRef = doc(db, 'users', userId);
              await setDoc(userRef, { hearts: newHearts }, { merge: true });
              console.log('Heart removed! New count:', newHearts);
            } catch (error: any) {
              console.error('Failed to update hearts in Firestore:', error);
            }
          }
        }

        return true;
      }


    }),
    {
      name: 'wizzy-auth-storage',
      storage: createJSONStorage(() => Platform.OS === 'web' ? localStorage : AsyncStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        isGuest: state.isGuest,
        user: state.user,
      }),
    }
  )
);

// Listen to Firebase auth state changes and sync with store
onAuthStateChanged(auth, async (firebaseUser) => {
  const store = useAuthStore.getState();

  if (firebaseUser && !store.isGuest) {
    // User is signed in with Firebase, fetch their data
    console.log('🔐 Firebase user detected, restoring session:', firebaseUser.email);
    await store.fetchUserData(firebaseUser.uid);
  } else if (!firebaseUser && !store.isGuest) {
    // User signed out from Firebase, return to guest mode
    console.log('🚪 Firebase user signed out, returning to guest mode');
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: true,
      user: { ...GUEST_USER },
    });
  }
});
