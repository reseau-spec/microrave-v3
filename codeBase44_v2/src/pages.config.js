/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Admin from './pages/Admin';
import CreateEvent from './pages/CreateEvent';
import EventLobby from './pages/EventLobby';
import Events from './pages/Events';
import Explore from './pages/Explore';
import Feed from './pages/Feed';
import Health from './pages/Health';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import Missions from './pages/Missions';
import MusicMap from './pages/MusicMap';
import Network from './pages/Network';
import Onboarding from './pages/Onboarding';
import Play from './pages/Play';
import Preferences from './pages/Preferences';
import Profile from './pages/Profile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "CreateEvent": CreateEvent,
    "EventLobby": EventLobby,
    "Events": Events,
    "Explore": Explore,
    "Feed": Feed,
    "Health": Health,
    "Home": Home,
    "Leaderboard": Leaderboard,
    "Missions": Missions,
    "MusicMap": MusicMap,
    "Network": Network,
    "Onboarding": Onboarding,
    "Play": Play,
    "Preferences": Preferences,
    "Profile": Profile,
}

export const pagesConfig = {
    mainPage: "Explore",
    Pages: PAGES,
    Layout: __Layout,
};