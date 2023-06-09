const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//register user into database
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserQuery);

  if (userDetails === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addUserQuery = `INSERT INTO user(
            name,username,password,gender)
            VALUES(
                "${name}","${username}","${hashedPassword}","${gender}"
            )`;
      addUser = await db.run(addUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordAuthentication = await bcrypt.compare(
      password,
      userDetails.password
    );

    if (passwordAuthentication) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "my-Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Write a middleware to authenticate the JWT token.
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my-Token", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserDetails);

  const getTweetQuery = `SELECT userFollower.username as username,tweet.tweet as tweet ,
  date_time as dateTime FROM
  ( user INNER JOIN follower ON user.user_id=follower.following_user_id) AS userFollower
  INNER JOIN tweet ON userFollower.user_id=tweet.user_id
    WHERE follower.follower_user_id=${userDetails.user_id} 
    ORDER BY dateTime desc
    limit 4 ;`;
  const getTweet = await db.all(getTweetQuery);

  response.send(getTweet);
});

//Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserDetails);

  const getTweetQuery = `SELECT name
   FROM
  user INNER JOIN follower ON user.user_id=follower.following_user_id
  WHERE follower.follower_user_id=${userDetails.user_id};`;
  const getTweet = await db.all(getTweetQuery);

  response.send(getTweet);
});

//Returns the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserDetails);

  const getTweetQuery = `SELECT name
   FROM
  user INNER JOIN follower ON user.user_id=follower.follower_user_id
  WHERE follower.following_user_id=${userDetails.user_id};`;
  const getTweet = await db.all(getTweetQuery);

  response.send(getTweet);
});

// return the tweet, likes count, replies count and date-time
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserDetails);
  const getFollowerQuery = `SELECT 
                                 follower.following_user_id as user_id 
                            FROM 
                              follower
                              INNER JOIN tweet 
                              ON follower.following_user_id = tweet.user_id
                            WHERE
                                follower.follower_user_id = ${userDetails.user_id}
                                AND tweet.tweet_id = ${tweetId};`;
  const followerDetails = await db.get(getFollowerQuery);
  if (followerDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetQuery = `SELECT  
                              userLike.tweet as tweet,
                              count(distinct userLike.like_id) as likes ,
                              count(distinct reply.reply_id) as replies,userLike.date_time as dateTime
                            FROM
                                (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS userLike
                                INNER JOIN  reply ON userLike.tweet_id= reply.tweet_id
                                where userLike.tweet_id=${tweetId}
                                ORDER BY userLike.tweet_id;
                                `;
    const getTweet = await db.get(getTweetQuery);
    response.send(getTweet);
  }
});

//return the list of usernames who liked the tweet
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const getFollowerQuery = `SELECT follower.following_user_id as user_id FROM follower
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id
   WHERE
   follower.follower_user_id=${userDetails.user_id}
   AND tweet.tweet_id=${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetQuery = `SELECT   *
   FROM
    like INNER JOIN user ON like.user_id=user.user_Id
    where like.tweet_id=${tweetId}
  `;
      const getTweet = await db.all(getTweetQuery);
      console.log(getTweet);
      let userArray = [];

      const likeObject = getTweet.map((each) => {
        userArray.push(each.username);
      });
      response.send({ likes: userArray });
    }
  }
);

//return the list of replies
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const getFollowerQuery = `SELECT follower.following_user_id as user_id FROM follower
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id
   WHERE
   follower.follower_user_id=${userDetails.user_id}
   AND tweet.tweet_id=${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetQuery = `SELECT    user.name,reply
   FROM
    reply INNER JOIN user ON reply.user_id=user.user_Id
    where reply.tweet_id=${tweetId}
  `;
      const getTweet = await db.all(getTweetQuery);
      let userArray = [];

      const likeObject = getTweet.map((each) => {
        userArray.push({ name: each.name, reply: each.reply });
      });
      response.send({ replies: userArray });
    }
  }
);

//Returns a list of all tweets of the user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserDetails);

  const getTweetQuery = `SELECT  userLike.tweet as tweet, count(distinct userLike.like_id)as likes ,
       count(distinct reply.reply_id) as replies,userLike.date_time as dateTime
   FROM
  (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS userLike
  INNER JOIN  reply ON userLike.tweet_id= reply.tweet_id
  WHERE userLike.user_id=${userDetails.user_id}
  GROUP BY userLike.tweet_id;
  
  `;
  const tweetDetails = await db.all(getTweetQuery);
  response.send(tweetDetails);
});

//Create a tweet in the tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserDetails);
  const addTweetQuery = `INSERT INTO tweet (tweet ,user_id)
  VALUES('${tweet}',${userDetails.user_id});`;
  const addTweet = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//If the user requests to delete a tweet of other users
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const tweetQuery = `SELECT * FROM user INNER JOIN tweet on user.user_id=tweet.user_id
  WHERE tweet.tweet_id=${tweetId} AND user.user_id=${userDetails.user_id};`;
    const tweetDetails = await db.get(tweetQuery);
    console.log(tweetDetails);
    if (tweetDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const addTweetQuery = `DELETE FROM tweet
    WHERE tweet_id=${tweetId}`;
      const deleteTweet = await db.run(addTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
