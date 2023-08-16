const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, updateDoc, arrayUnion } = require('firebase/firestore');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const secretKey = process.env.JWT_SECRET_KEY;
// Create firestorep authentication object
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const app = express();
app.use(cors());
app.use(express.json());
app.use(upload);
app.get('/profile/:username', async (req, res) => {
  try {
    const username = req.params.username; // Access the user ID from the URL parameter
    // Query the database to retrieve user data based on the user ID
    const usersRef = collection(db, 'user_accounts');
    const querySnapshot = await getDocs(usersRef);
    const user = querySnapshot.docs.find((doc) => doc.data().username.toLowerCase() === username.toLowerCase());
    if (result.rows.length === 1) {
      const user = result.rows[0];
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

    // Create a Firestore query to retrieve competitions where user_id is equal to id
    // or where the participants array contains an object with the given username
    const competitionsRef = collection(db, 'competitions');
    const q = query(competitionsRef, where('user_id', '==', id), where('participants', 'array-contains', { name: lowerName }));

    const querySnapshot = await getDocs(q);
    const competitions = [];
    querySnapshot.forEach((doc) => {
      competitions.push(doc.data());
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
    const { username, email, password, first_name, last_name, phoneNumber } = req.body;
    const lowerUsername = username.toLowerCase(); // Convert username to lowercase
    const lowerEmail = email.toLowerCase(); // Convert email to lowercase

    // Check if the username or email already exists in the database
    const usersRef = collection(db, 'user_accounts');
    const usernameQuery = query(usersRef, where('username', '==', lowerUsername));
    const emailQuery = query(usersRef, where('email', '==', lowerEmail));

    const [usernameSnapshot, emailSnapshot] = await Promise.all([
      getDocs(usernameQuery),
      getDocs(emailQuery)
    ]);

    if (!usernameSnapshot.empty || !emailSnapshot.empty) {
      // User already exists
      return res.status(400).json({ error: 'Username or email already registered' });
    }

    // Insert data into the user_accounts collection
    const newUser = {
      username: lowerUsername,
      email: lowerEmail,
      password,
      first_name,
      last_name,
      phone_number: phoneNumber
    };

    const newUserRef = await addDoc(collection(db, 'user_accounts'), newUser);

    // Generate an authentication token (You need to handle this part according to your authentication method)
    const token = jwt.sign({username, email}, secretKey);

    // Send the token and other user information to the frontend
    res.status(200).json({ token, ...newUser, user_id: newUserRef.id });
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Define POST request for user login
app.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    const usernameOrEmailLower = usernameOrEmail.toLowerCase(); // Convert input to lowercase

    // Query the Firestore to retrieve user account data based on the provided username/email
    const usersRef = collection(db, 'user_accounts');
    const query = query(usersRef, where('username', '==', usernameOrEmailLower), where('email', '==', usernameOrEmailLower));

    const querySnapshot = await getDocs(query);

    if (!querySnapshot.empty) {
      const user = querySnapshot.docs[0].data();

      if (compareSync(password, user.password)) {
        const token = sign({ username: user.username }, secretKey);
        res.json({ token, username: user.username, user_id: user.user_id, phone_number: user.phone_number }); // Include user_id in the response
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
    const usersRef = collection(db, 'user_accounts');
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
      res.json(event);
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
// app.post('/user/:username/profile-picture', upload, async(req, res) => {
//   upload(req, res, async (err) => {
//     if (err) {
//       console.error('Error uploading file:', err);
//       return res.sendStatus(500);
//     }
//     try {
//       const username = req.params.username;
//       const file = req.file.buffer; // Access the uploaded file using req.file
//       console.log('req.file:', req.file);
//       console.log('file:', file);
//       // Query the database to update the profile picture of the user with matching username
//       const lowerUsername = username.toLowerCase();
//       const result = await pool.query('UPDATE user_accounts SET profile_picture = $1 WHERE LOWER(username) = $2 RETURNING *', [file, lowerUsername]);
//       if (result.rows.length === 1) {
//         const user = result.rows[0];
//         user.profile_picture = file
//         // Return the updated user data as the response
//         res.json(user);
//       } else {
//         // User not found
//         res.sendStatus(404);
//       }
//     } catch (error) {
//       console.error('Error updating profile picture:', error);
//       res.sendStatus(500);
//     }
//   });
// });
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
    const usersRef = collection(db, 'user_accounts');
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
    const { user_id, title, description, organizer, location, time, date, images, categories, price } = req.body;

    // Add data to the 'competitions' collection in Firestore
    const competitionsRef = collection(db, 'competitions');
    await addDoc(competitionsRef, {
      user_id,
      title,
      description,
      organizer,
      location,
      event_time: time,
      date,
      images,
      category: categories,
      price
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
    const reviewDoc = doc(db, 'reviews', id);
    await updateDoc(reviewDoc, {
      general_reviews: arrayUnion({ name, review, id })
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
        participants: arrayUnion({ name, username, phone_number: phoneNumber })
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
app.post('/newsletter', async (req, res) => {
  try {
    const { passedEmail } = req.body;

    // Get the document reference for the reviews collection
    const reviewsCollection = collection(db, 'reviews');
    const reviewsDoc = doc(reviewsCollection, 'newsletter');

    // Get the current newsletter email list
    const newsletterSnapshot = await getDoc(reviewsDoc);
    const existingEmailList = newsletterSnapshot.data()?.newsletter_email_list || [];

    // Check if the user is already subscribed
    const isAlreadySubscribed = existingEmailList.some(emailObj =>
      emailObj.email?.toLowerCase() === passedEmail?.toLowerCase()
    );

    if (isAlreadySubscribed) {
      return res.status(400).json({ error: 'You are already subscribed!' });
    }

    // Update the email list in the document
    await updateDoc(reviewsDoc, {
      newsletter_email_list: arrayUnion({ email: passedEmail })
    });

    res.status(200).json({ message: 'Successfully updated newsletter email list' });
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});
const port = 3000
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});