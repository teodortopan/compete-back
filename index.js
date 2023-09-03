const express = require('express');
const { compareSync, hashSync } = require('bcrypt'); 
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const uuidv4 = require('uuid').v4;
const { getFirestore, collection, getDocs, addDoc, updateDoc, arrayUnion, query, where, deleteDoc } = require('firebase/firestore');
const { getDoc, doc } = require('firebase/firestore');
const jwt = require('jsonwebtoken');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const corsOptions = {
  origin: 'https://compete-ce97a.web.app',
};
// Initialize the Firebase Admin SDK
admin.initializeApp();
require('dotenv').config();
const secretKey = process.env.JWT_SECRET_KEY;
// Create firestorep authentication object
const firebaseConfig = {
  apiKey: process.env.COMPETE_FIREBASE_API_KEY,
  authDomain: process.env.COMPETE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.COMPETE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.COMPETE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.COMPETE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.COMPETE_FIREBASE_APP_ID,
  measurementId: process.env.COMPETE_FIREBASE_MEASUREMENT_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.get('/profile/:username', async (req, res) => {
  try {
    const username = req.params.username; // Access the user ID from the URL parameter
    // Query the database to retrieve user data based on the user ID
    const usersRef = collection(db, 'userAccounts');
    const querySnapshot = await getDocs(usersRef);
    const user = querySnapshot.docs.find((doc) => doc.data().username.toLowerCase() === username.toLowerCase());
    if (user) {
      // Return the user data as the response
      res.json(user);
    } else {
      // User not found
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error retrieving user:', error);
    res.sendStatus(500);
  }
});
app.get('/:name/:id', async (req, res) => {
  try {
    const name = req.params.name; // Access the username from the URL parameter
    const decodedName = decodeURIComponent(name);
    const id = req.params.id; // Access the user ID from the URL parameter
    const lowerName = decodedName.toLowerCase();

    // Fetch all competitions from Firestore
    const competitionsRef = collection(db, 'competitions');
    const querySnapshot = await getDocs(competitionsRef);
    
    // Filter competitions based on userId or participants
    const competitions = [];
    querySnapshot.forEach((doc) => {
      const competitionData = doc.data();
      if (competitionData.userId === id || competitionData.participants.some(participant => participant.name.toLowerCase() === lowerName)) {
        competitions.push({ ...competitionData, id: doc.id }); // Include id property in the response
      }
    });

    if (competitions.length > 0) {
      // Return the competitions data as the response
      res.json(competitions);
    } else {
      // No competitions found
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error retrieving competitions:', error);
    res.sendStatus(500);
  }
});
// Define POST request to post user account data to postgreSQL table
app.post('/post_user', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, phoneNumber } = req.body;
    const lowerUsername = username.toLowerCase(); // Convert username to lowercase
    const lowerEmail = email.toLowerCase(); // Convert email to lowercase
    const userId = uuidv4();

    // Check if the username or email already exists in the database
    const usersRef = collection(db, 'userAccounts');
    const usernameQuery = query(usersRef, where('username', '==', lowerUsername));
    const emailQuery = query(usersRef, where('email', '==', lowerEmail));
    const phoneQuery = query(usersRef, where('phoneNumber', '==', phoneNumber));

    const [usernameSnapshot, emailSnapshot, phoneSnapshot] = await Promise.all([
      getDocs(usernameQuery),
      getDocs(emailQuery),
      getDocs(phoneQuery)
    ]);

    if (!usernameSnapshot.empty || !emailSnapshot.empty || !phoneSnapshot.empty) {
      // User already exists
      return res.status(400).json({ error: 'Username, email, or phone number already registered' });
    }

    // Insert data into the user_accounts collection
    const newUser = {
      username: lowerUsername,
      email: lowerEmail,
      password: hashSync(password, 10),
      firstName,
      lastName,
      phoneNumber: phoneNumber,
      userId
    };

    const newUserRef = await addDoc(collection(db, 'userAccounts'), newUser);

    // Generate an authentication token (You need to handle this part according to your authentication method)
    const token = jwt.sign({username, email}, secretKey);

    // Send the token and other user information to the frontend
    res.status(200).json({ token, ...newUser, userId: newUserRef.id });
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Define POST request for user login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const lowerEmail = email.toLowerCase(); // Convert input to lowercase

    // Query the Firestore to retrieve user account data based on the provided username/email
    const usersRef = collection(db, 'userAccounts');
    const loginQuery = query(usersRef, where('email', '==', lowerEmail));

    const querySnapshot = await getDocs(loginQuery);

    if (!querySnapshot.empty) {
      const user = querySnapshot.docs[0].data();

      if (compareSync(password, user.password)) {
        const token = jwt.sign({ username: user.username }, secretKey);
        res.json({ token, username: user.username, userId: user.userId, phoneNumber: user.phoneNumber }); // Include user_id in the response
      } else {
        res.sendStatus(401); // Invalid password
      }
    } else {
      res.sendStatus(401); // Invalid username/email
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.sendStatus(500);
  }
});
// Define GET request to pull user account data from postgreSQL table
app.get('/user_accounts', async (req, res) => {
  try {
    // Query the Firestore to retrieve all documents from the 'user_accounts' collection
    const usersRef = collection(db, 'userAccounts');
    const querySnapshot = await getDocs(usersRef);
    
    const userAccounts = [];
    querySnapshot.forEach(doc => {
      userAccounts.push(doc.data());
    });

    res.json(userAccounts);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/event/:competition/:id', async (req, res) => {
  try {
    const competition = req.params.competition;
    const eventId = req.params.id;
    
    // Query Firestore to retrieve the event document based on the event ID
    const eventRef = doc(db, 'competitions', eventId);
    const eventDoc = await getDoc(eventRef);

    if (eventDoc.exists()) {
      const event = eventDoc.data();
      res.json(event); // Include id as a property in the response JSON
    } else {
      // Event not found
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error retrieving event:', error);
    res.sendStatus(500);
  }
});
app.post('/event/:competition/:id/delete', async (req, res) => {
  try {
    const eventId = req.params.id;

    // Delete the event document from Firestore
    const eventRef = doc(db, 'competitions', eventId);
    await deleteDoc(eventRef);

    // Deletion successful
    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting event:', error);
    res.sendStatus(500);
  }
});
app.post('/event/:competition/:id/unregister', async (req, res) => {
  try {
    const id = req.params.id;
    const { username } = req.body;

    // Get the document reference for the competition
    const competitionDoc = doc(db, 'competitions', id);
    const competitionSnapshot = await getDoc(competitionDoc);

    if (competitionSnapshot.exists()) {
      const competitionData = competitionSnapshot.data();

      // Find the index of the participant with the provided username
      const participantIndex = competitionData.participants.findIndex(
        (participant) => participant.username.toLowerCase() === username.toLowerCase()
      );

      if (participantIndex !== -1) {
        // Remove the participant from the array
        competitionData.participants.splice(participantIndex, 1);

        // Update the participants array in the document
        await updateDoc(competitionDoc, {
          participants: competitionData.participants
        });

        res.status(200).json({ message: 'Successfully removed participant' });
      } else {
        res.status(400).json({ error: 'Participant not found' });
      }
    } else {
      res.status(404).json({ error: 'Event not found' });
    }
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.get('/competitions', async (req, res) => {
  try {
    // Retrieve all documents from the 'competitions' collection
    const competitionsRef = collection(db, 'competitions');
    const querySnapshot = await getDocs(competitionsRef);
    const competitions = [];

    querySnapshot.forEach((doc) => {
      competitions.push({ id: doc.id, ...doc.data() });
    });

    res.json(competitions);
  } catch (error) {
    console.error('Error retrieving competitions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/username', async (req, res) => {
  try {
    const email = req.query.email; // Access email from query parameters
    const lowerEmail = email.toLowerCase();

    // Retrieve the username from Firestore based on the email
    const usersRef = collection(db, 'userAccounts');
    const q = query(usersRef, where('email', '==', lowerEmail));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.size === 1) {
      const user = querySnapshot.docs[0].data();
      res.json({ username: user.username });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error retrieving username:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Define POST request to post user account data to postgreSQL table
app.post('/post_competitions', async (req, res) => {
  try {
    const { userId, title, description, organizer, location, eventTime, date, images, categories, price } = req.body;
    const participants = []
    // Add data to the 'competitions' collection in Firestore
    const competitionsRef = collection(db, 'competitions');
    await addDoc(competitionsRef, {
      userId,
      title,
      description,
      organizer,
      location,
      eventTime,
      images,
      category: categories,
      price,
      participants,
    });

    res.sendStatus(200); // Send a success response
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/review', async (req, res) => {
  try {
    const { name, review, id } = req.body;

    // Update the 'reviews' collection in Firestore
    const reviewDoc = doc(db, 'improvements', 'rmnb5SKwhN6zai8ZZb2B');
    await updateDoc(reviewDoc, {
      generalReviews: arrayUnion({ name, review, id })
    });

    res.sendStatus(200); // Send a success response
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/participate/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, phoneNumber, username } = req.body;

    // Get the document reference for the competition
    const competitionDoc = doc(db, 'competitions', id);
    const competitionSnapshot = await getDoc(competitionDoc);

    if (competitionSnapshot.exists()) {
      const competitionData = competitionSnapshot.data();

      // Check if the user is already a participant
      const isAlreadyParticipant = competitionData.participants.some(
        (participant) => participant.username.toLowerCase() === username.toLowerCase()
      );

      if (isAlreadyParticipant) {
        return res.status(400).json({ error: 'You are already registered for this event!' });
      }

      // Add the user to the participants array
      await updateDoc(competitionDoc, {
        participants: arrayUnion({ name, username, phoneNumber: phoneNumber })
      });

      res.status(200).json({ message: 'Successfully updated participants' });
    } else {
      res.status(404).json({ error: 'Event not found' });
    }
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/subscribe-newsletter', async (req, res) => {
  try {
    const email = req.body.email;

    // Query Firestore to retrieve the document for the "newsletter" section in "improvements"
    const newsletterRef = doc(db, 'improvements', 'HPqBQ3yqvcfnM4R6x5hP');
    const newsletterDoc = await getDoc(newsletterRef);

    if (newsletterDoc.exists()) {
      const newsletterData = newsletterDoc.data();
      const emailList = newsletterData?.newsletterEmailList || [];
      if (emailList.includes(email)) {
        return res.status(400).json({ error: 'Email is already subscribed' });
      }
      const updatedEmailList = [...emailList, email];

      // Update the email list in the "newsletter" document
      await updateDoc(newsletterRef, {
        newsletterEmailList: updatedEmailList
      });

      res.status(200).json({ message: 'Email added to newsletter list' });
    } else {
      res.status(404).json({ error: 'Newsletter document not found' });
    }
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
const port = 3000
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

exports.api = functions.https.onRequest(app);