const express = require("express");
const path = require("path");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const jsonMiddleware = express.json();
app.use(jsonMiddleware);
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
      console.log("server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();
//api 1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (request.body.password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.status(200);
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
//api 2
//login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
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
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};
//api3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const getTweetsQuery = `
    SELECT 
    user.username as username,
    tweet.tweet as tweet,
    tweet.date_time as dateTime
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id
    WHERE user.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ${userId}) 
    ORDER BY tweet.date_time DESC 
    LIMIT 4 
    OFFSET 0;
    `;
  const getTweetsArray = await db.all(getTweetsQuery);
  response.send(getTweetsArray);
});
//api4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const getNamesOfFollowersQuery = `
    SELECT 
    name
    FROM user
    WHERE
    user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ${userId});`;
  const getNamesOfFollowers = await db.all(getNamesOfFollowersQuery);
  response.send(getNamesOfFollowers);
});
//api5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const getNamesOfFollowingQuery = `
    SELECT 
    name
    FROM user
    WHERE
    user_id IN (SELECT follower_user_id FROM follower WHERE following_user_id = ${userId});`;
  const getNamesOfFollowing = await db.all(getNamesOfFollowingQuery);
  response.send(getNamesOfFollowing);
});
//api6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const tweetPosterUserIdQuery = `
  SELECT user_id as tweetPosterId
  FROM tweet
  WHERE tweet_id = ${tweetId};`;
  const postersTweetId = await db.get(tweetPosterUserIdQuery);
  const { tweetPosterId } = postersTweetId;
  const userFollowingsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId}`;
  const userFollowings = await db.all(userFollowingsQuery);
  const followingUsersIds = userFollowings.map((x) => {
    return x.following_user_id;
  });
  if (!followingUsersIds.includes(tweetPosterId)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetailsQuery = `
      SELECT tweet.tweet AS tweet, COUNT(reply.reply) AS replies, COUNT(like.like_id) AS likes, tweet.date_time AS dateTime
      FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) INNER JOIN like ON tweet.tweet_id = like.tweet_id
      WHERE tweet.tweet_id = ${tweetId};`;
    const getTweetDetails = await db.get(getTweetDetailsQuery);
    response.send(getTweetDetails);
  }
});
//api7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = payload;
    const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
    const userId = await db.get(userIdQuery);
    const { userId } = userId;
    const tweetPosterUserIdQuery = `
  SELECT user_id as tweetPosterId
  FROM tweet
  WHERE tweet_id = ${tweetId};`;
    const postersTweetId = await db.get(tweetPosterUserIdQuery);
    const { tweetPosterId } = postersTweetId;
    const userFollowingsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId}`;
    const userFollowings = await db.all(userFollowingsQuery);
    const followingUsersIds = userFollowings.map((x) => {
      return x.following_user_id;
    });
    if (!followingUsersIds.includes(tweetPosterId)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getUsernamesOfWhoLikedQuery = `
      SELECT username as likes
      FROM user
      WHERE user_id IN (SELECT user_id FROM like WHERE tweet_id = ${tweetId});`;
      const getUsernamesOfWhoLiked = await db.get(getUsernamesOfWhoLikedQuery);
      response.send(getUsernamesOfWhoLiked);
    }
  }
);
//api8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = payload;
    const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
    const userId = await db.get(userIdQuery);
    const { userId } = userId;
    const tweetPosterUserIdQuery = `
  SELECT user_id as tweetPosterId
  FROM tweet
  WHERE tweet_id = ${tweetId};`;
    const postersTweetId = await db.get(tweetPosterUserIdQuery);
    const { tweetPosterId } = postersTweetId;
    const userFollowingsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId}`;
    const userFollowings = await db.all(userFollowingsQuery);
    const followingUsersIds = userFollowings.map((x) => {
      return x.following_user_id;
    });
    if (!followingUsersIds.includes(tweetPosterId)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `
      SELECT user.name AS name, reply.reply AS reply
      FROM user INNER JOIN reply ON user.user_id = reply.user_id
      WHERE reply.tweet_id = ${tweetId};`;
      const getReplies = await db.get(getRepliesQuery);
      const getRepliesObject = { replies: getReplies };
      response.send(getRepliesObject);
    }
  }
);
//api9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const getUserTweetsDetailsQuery = `
    SELECT tweet.tweet AS tweet,  COUNT(like.like_id) AS likes, COUNT(reply.reply) AS replies, tweet.date_time AS dateTime
    FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) INNER JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId} GROUP BY tweet.tweet_id ;`;
  const getUserTweetsDetails = await db.all(getUserTweetsDetailsQuery);
  response.send(getUserTweetsDetails);
});
//api10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const {tweet} = request.body;
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const date = new Date();
  const dateTimeStr=`${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
  const postTweetQuery=`
  INSERT INTO tweet (tweet, user_id, date_time)
  VALUES('${tweet}', '${userId}'), '${dateTime}'`;
  const newTweet = await db.run(postTweetQuery);
  const newTweetId = newTweet.lastID;
  response.send("Created a Twee")
})
//api11
app.delete("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const { username } = payload;
  const userIdQuery = `
      SELECT user_id as userId
      FROM user
      WHERE username=${username};`;
  const userId = await db.get(userIdQuery);
  const { userId } = userId;
  const getUserTweetPosterQuery=`SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
  const getUserTweetPoster = await db.get(getUserTweetPosterQuery);
  const {user_id} = getUserTweetPoster;
  if {!user_id === userId} {
      response.status(401);
      response.send("Invalid Request")
  }
  else {
      const deleteTweetQuery=`DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed")
  }
})
module.exports = app;
