/* eslint-disable  func-names */
/* eslint-disable  no-console */
/* eslint-disable  no-use-before-define */


/*
    Alexa Skill Name: Movie Now.
              
    Description: Movie Now is a sample Alexa Skill that can learn about the user's movie preferences
    such as favorite genres or actors, then recommends movies users will enjoy!
    
    Features:
        * Movie Now tracks your favorite actors or movie genres. At any point the user can say "I'm a fan of Bruce Lee" or "I enjoy sci-fi movies" etc.
        * User can skip all dialogs by saying "Surprise me" or "Just pick something random" or "Pick a movie for me" etc.
        * The Skill also asks user to rate the latest recommendation and remembers the rating for future recommendations.
        * Overall, Movie Now learns the users' various preferencess and makes better and better movie recommendations!
*/

// 0. Dependencies ===================================================================================

const Alexa   = require('ask-sdk-core');
const i18n    = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
let persistenceAdapter;

/*
    This Skill will use S3 based persistence if in an Alexa-Hosted env and DynamoDB otherwise.
    If using Alexa Hosted Skills, one can't use DynamoDB and have to switch to S3 based persistence.
    More info:
    https://developer.amazon.com/docs/hosted-skills/build-a-skill-end-to-end-using-an-alexa-hosted-skill.html
    https://ask-sdk-for-nodejs.readthedocs.io/en/latest/Managing-Attributes.html
*/
if (isAlexaHosted()) {
    const {S3PersistenceAdapter} = require('ask-sdk-s3-persistence-adapter');
    persistenceAdapter = new S3PersistenceAdapter({ 
        bucketName: process.env.S3_PERSISTENCE_BUCKET,
        objectKeyGenerator: keyGenerator
    });
} else {
    // INFO: https://developer.amazon.com/en-US/docs/alexa/smapi/manage-credentials-with-ask-cli.html#create-aws-credentials
    // IMPORTANT: need to grant DynamoDB access to the proper Role in IAM to run this lambda
    const {DynamoDbPersistenceAdapter} = require('ask-sdk-dynamodb-persistence-adapter');
    persistenceAdapter = new DynamoDbPersistenceAdapter({ 
        tableName: 'movie_now_table',
        createTable: true,
        partitionKeyGenerator: keyGenerator
    });
}

// 1. Handlers ===================================================================================

const LaunchHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder   = handlerInput.responseBuilder;
        const requestAttributes = attributesManager.getRequestAttributes();
        
        const speechOutput = `${requestAttributes.t('WELCOME')} ${requestAttributes.t('HELP')}`;
        const repromptText = `I recently watched ${requestAttributes.t('RECENT')}. What about you?`;    
        
        return responseBuilder.speak(speechOutput).reprompt(repromptText).getResponse();
    },
};

// Since user preferencess are persisted across sessions
// The Skill asks returned user to rate the latest recommendation and remembers the rating for future recommendations.
const ReturnUserHandler = {
    canHandle(handlerInput) {
        const request           = handlerInput.requestEnvelope.request;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        
        return request.type === 'LaunchRequest' && sessionAttributes['lastUseTimestamp'] && sessionAttributes['recommendedMovies'];
    },
    handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        
        const recommendedMovies = sessionAttributes['recommendedMovies'];
        let speakOutput = `Welcome back! Looks like you need to watch a fun movie, how can I help?`;
        
        for (let i = 0; i < recommendedMovies.length; i++) {
            let movie = recommendedMovies[i];
            
            // Lookup previous recommended movies that hasn't been rated by user
            if (!movie.userRated) {
                speakOutput = `Welcome back! Hopefully you watched ${movie.name} I recommended last time. Can you rate it please?`;
                setCurrentUserState(attributesManager, 'RATING');
                break;
            }
        }
        
        return responseBuilder.speak(speakOutput).reprompt(speakOutput).getResponse();
    }
};

const CaptureGenreIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'CaptureGenreIntent';        
    },
    async handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;

        // save new genre preference
        let genre = handlerInput.requestEnvelope.request.intent.slots.genre.value;
        saveUserAttributes(attributesManager, 'favGenres', genre);
        
        // recommend movie based on new preference
        let movie = recommendMovieNow(attributesManager, 'favGenres');
        
        const speechOutput = `Great, I'm a fan of ${genre} movie as well. ${recommendMovieNowSpeakOutput(movie)}. What other movie do you like?`;

        return responseBuilder.speak(speechOutput).reprompt(speechOutput).getResponse();
    },
};

const CaptureActorIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'CaptureActorIntent';        
    },
    handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;

        // save new actor/actress preference
        let actor = handlerInput.requestEnvelope.request.intent.slots.actor.value;
        saveUserAttributes(attributesManager, 'favActors', actor);
        // recommend movie based on new preference
        let movie = recommendMovieNow(attributesManager, 'favActors');
        
        const speechOutput = `Wonderful, I like ${actor} as well. ${recommendMovieNowSpeakOutput(movie)}. What else can I help today?`;

        return responseBuilder.speak(speechOutput).reprompt(speechOutput).getResponse();
    },
};

const RecommendMovieIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'RecommendMovieIntent';        
    },
    handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
       
        let movie    = recommendMovieNow(attributesManager);
        let selector = ''; 

        if (sessionAttributes['favGenres'] && sessionAttributes['favGenres'].length) {
            selector = `since you like ${randomArrayElement(sessionAttributes['favGenres'])} movie`;
        } else if (sessionAttributes['favActors'] && sessionAttributes['favActors'].length) {
            selector = `since you are fan of ${randomArrayElement(sessionAttributes['favActors'])}`;
        } else if (sessionAttributes['moviePreferences'] && sessionAttributes['moviePreferences'].length) {
            selector = `since you enjoy something ${randomArrayElement(sessionAttributes['moviePreferences'])}`;
        } else {
            selector = 'I recently watched lots of movies on Netflix';
        }
        
        const speechOutput = `Hmmm, ${selector}, I think you will definitely like this one! ${recommendMovieNowSpeakOutput(movie)}. Would you like another recommendation?`;
        setCurrentUserState(attributesManager, 'RECOMMENDING');
        
        return responseBuilder.speak(speechOutput).getResponse();        
    },
};

const CapturePreferenceIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'CapturePreferenceIntent';        
    },
    handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;

        // save movie preference
        let preference = handlerInput.requestEnvelope.request.intent.slots.preference.value;
        saveUserAttributes(attributesManager, 'moviePreferences', preference);
        // recommend movie based on new preference
        let movie      = recommendMovieNow(attributesManager, 'moviePreferences');
        
        const speechOutput = `Well, I can definitely recommend something ${preference}. ${recommendMovieNowSpeakOutput(movie)}. What else can I help today?`;        

        return responseBuilder.speak(speechOutput).reprompt(speechOutput).getResponse();        
    },
};

const CaptureRatingIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        
        return request.type === 'IntentRequest' 
                && request.intent.name === 'CaptureRatingIntent'
                && sessionAttributes['lastUseTimestamp']
                && sessionAttributes['recommendedMovies'];      
    },
    handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        
        const recommendedMovies = sessionAttributes['recommendedMovies'];
        const rating            = handlerInput.requestEnvelope.request.intent.slots.rating.value;
        
        let speechOutput = '';
        for (let i = 0; i < recommendedMovies.length; i++) {
            let movie = recommendedMovies[i];
            
            if (!movie.userRated) {
                movie.userRated = true;
                movie.userRating = rating;
                
                attributesManager.setSessionAttributes(sessionAttributes);
                speechOutput = `Great, thanks for rating ${movie.name}! What type of movie do you want to watch today?`;
                setCurrentUserState(attributesManager, 'DEFAULT');
                break;
            }
        }
        
        return responseBuilder.speak(speechOutput).reprompt(speechOutput).getResponse();        
    },
};

const YesNoHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && (request.intent.name === 'AMAZON.YesIntent' || request.intent.name === 'AMAZON.NoIntent');
    },
    handle(handlerInput) {
        const responseBuilder   = handlerInput.responseBuilder;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const requestName       = handlerInput.requestEnvelope.request.intent.name;
        const userState  = sessionAttributes['userState'];

        let speechOutput = '';

        //Handle yes and no intents based on current state persisted via session attributes
        switch(userState) {
            case 'RATING':
                if (requestName === 'AMAZON.YesIntent') {
                    speechOutput = `You can rate it by telling me how you feel about the movie or just using a scale of one to five star. What do you think?`;   
                } else {
                    speechOutput = `No problem - Next time perhaps. Rating allows me to better understand your preferences
                                    and makes my movie recommendation better each time! What type of movie do you want to watch today?`;
                }     
                
                break;
            case 'RECOMMENDING':
                if (requestName === 'AMAZON.YesIntent') {
                    //intent chaining for dialog management
                    return responseBuilder
                            .addDelegateDirective({
                                name: 'RecommendMovieIntent',
                                confirmationStatus: 'NONE',
            			        slots: {}
                            })
                            .getResponse();                
                } else {
                    speechOutput = 'Ok, what else can I help today?';
                }     
                
                break;
            default:
                speechOutput = `Yes or No to what?`;
        }
        
        return responseBuilder
                .speak(speechOutput)
                .addDelegateDirective()
                .getResponse();
    },
};


const HelpHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder   = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();
        return responseBuilder
            .speak(requestAttributes.t('HELP'))
            .reprompt(requestAttributes.t('HELP'))
            .getResponse();
    },
};

const StopHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest'
            && (request.intent.name === 'AMAZON.CancelIntent'
            || request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder   = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();
        return responseBuilder
            .speak(requestAttributes.t('STOP'))
            .getResponse();
    },
};

const SessionEndedHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

        return handlerInput.responseBuilder.getResponse();
    },
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        console.log(`Error handled: ${error.message}`);
        console.log(` Original request was ${JSON.stringify(request, null, 2)}\n`);

        return handlerInput.responseBuilder
            .speak('Sorry, I can\'t understand the command. Please say again.')
            .reprompt('Sorry, I can\'t understand the command. Please say again.')
            .getResponse();
    },
};

const FallbackHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak(FALLBACK_MESSAGE).reprompt(FALLBACK_REPROMPT).getResponse();
  },
};


// 2. Constants ==================================================================================

const languageStrings = {
    en: {
        translation: {
            WELCOME: [
                'Welcome to Movie Now!',
                'Hello! Welcome to Movie Now!',
            ],
            HELP: [
                'What kind of movie do you like?',
                'What type of movie do you watch?',
            ],
            RECENT: [
                'The Hunger Game',
                'Star Trek',
                'Star Wars The Rise of Skywalker',
                'Transformer Two',
            ],
            STOP: 'Okay, see you next time!',
        },
    },
};

const data = {
    movies: [
        {
            name: 'Black Panther',
            description: '"Black Panther" follows T\'Challa who, after the events of "Captain America: Civil War," returns home to the isolated, technologically advanced African nation of Wakanda to take his place as King. However, when an old enemy reappears on the radar, T\'Challa\'s mettle as King and Black Panther is tested when he is drawn into a conflict that puts the entire fate of Wakanda and the world at risk.',
            rating: 'PG-13',
            genre: 'Action & Adventure, Drama, Science Fiction & Fantasy',
            year: '2018',
            userRating: '79%',
            userRatingCount: '88211',
            id: '1',
        },
        {
            name: 'AVENGERS: ENDGAME',
            description: 'The grave course of events set in motion by Thanos that wiped out half the universe and fractured the Avengers ranks compels the remaining Avengers to take one final stand in Marvel Studios\' grand conclusion to twenty-two films, "Avengers: Endgame."',
            rating: 'PG-13',
            genre: 'Action & Adventure, Drama, Science Fiction & Fantasy',
            year: '2019',
            userRating: '90%',
            userRatingCount: '67984',
            id: '2',
        },
        {
            name: 'A STAR IS BORN',
            description: 'In "A Star Is Born," Bradley Cooper and Lady Gaga fuse their considerable talents to depict the raw and passionate tale of Jack and Ally, two artistic souls coming together, on stage and in life. Theirs is a complex journey through the beauty and the heartbreak of a relationship struggling to survive.',
            rating: 'R',
            genre: 'Drama',
            year: '2019',
            userRating: '79%',
            userRatingCount: '19820',
            id: '3',
        },
        {
            name: 'THE WIZARD OF OZ',
            description: 'L. Frank Baum\'s classic tale comes to magisterial Technicolor life! The Wizard of Oz stars legendary Judy Garland as Dorothy, an innocent farm girl whisked out of her mundane earthbound existence into a land of pure imagination. Dorothy\'s journey in Oz will take her through emerald forests, yellow brick roads, and creepy castles, all with the help of some unusual but earnest song-happy friends.',
            rating: 'G',
            genre: 'Classics, Kids & Family, Musical & Performing Arts, Science Fiction & Fantasy',
            year: '1939',
            userRating: '93%',
            userRatingCount: '876076',
            id: '4',
        },
        {
            name: 'THE DARK KNIGHT',
            description: 'Christopher Nolan steps back into the director\'s chair for this sequel to Batman Begins, which finds the titular superhero coming face to face with his greatest nemesis -- the dreaded Joker.',
            rating: 'PG-13',
            genre: 'Action & Adventure, Drama, Science Fiction & Fantasy',
            year: '2008',
            userRating: '94%',
            userRatingCount: '1831566',
            id: '5',
        },
        {
            name: 'CASINO ROYALE',
            description: 'James Bond\'s first 007 mission takes him to Madagascar, where he is to spy on a terrorist Mollaka. Not everything goes as planned and Bond decides to investigate, independently of the MI6 agency, in order to track down the rest of the terrorist cell.',
            rating: 'PG-13',
            genre: 'Action & Adventure, Mystery & Suspense',
            year: '2007',
            userRating: '89%',
            userRatingCount: '703261',
            id: '6',
        },            
    ],
};

const SKILL_NAME        = 'Movie Now';
const FALLBACK_MESSAGE  = `The ${SKILL_NAME} skill can help you pick a great movie to watch by learning your preferences such as your favorite movie genres or actors. What type of movie do you like?`;
const FALLBACK_REPROMPT = 'I`m a fan of sci-fi movies, what about you?';


// 3. Helper Functions ==========================================================================

function getMoviesByGenre(genreType) {
    const list = [];
    for (let i = 0; i < data.movies.length; i += 1) {
        let genre  = data.movies[i].genre.toLowerCase();
        let target = genreType.toLowerCase();
        if (genre.search(target) > -1 || genre.includes(target)) {
            list.push(data.movies[i]);
        }
    }
    
    if (list.length) {
        return list;
    }
    return getMoviesByRandom();
}

function getMoviesByPreference(preferenceType) {
    return getMoviesByRandom();
}

function getMoviesByRandom() {
    return data.movies;
}

function randomArrayElement(array) {
    let i = 0;
    i = Math.floor(Math.random() * array.length);
    return (array[i]);
}

function saveUserAttributes(attributesManager, key, attributes) {
    const sessionAttributes = attributesManager.getSessionAttributes() || {};
    
    if (sessionAttributes[key]) {
        sessionAttributes[key].push(attributes);
    } else {
        sessionAttributes[key] = [attributes];
    }

    attributesManager.setSessionAttributes(sessionAttributes);
}

function setCurrentUserState(attributesManager, key) {
    const sessionAttributes = attributesManager.getSessionAttributes();
    
    sessionAttributes['userState'] = key;
    
    attributesManager.setSessionAttributes(sessionAttributes);
}

function recommendMovieNow(attributesManager, key) {
        const sessionAttributes = attributesManager.getSessionAttributes() || {};    
        
        let movie = '';
        
        if (sessionAttributes.favActors && key === 'favActors') {
            //pick a movie based on 'favActors'
            movie = randomArrayElement(getMoviesByRandom());
        } else if (sessionAttributes.favGenres && key === 'favGenres') {
            //pick a movie based on 'favGenres'
            movie = randomArrayElement(getMoviesByRandom());
        } else if (sessionAttributes.moviePreferences === 'moviePreferences') {
            //pick a movie based on 'moviePreferences'
            movie = randomArrayElement(getMoviesByRandom());
        } else {
            //pick a random movie
            movie = randomArrayElement(getMoviesByRandom());
        }
        
        // save recommended movie by this skill
        const recommendedMovieAttributes = {
            'id': movie.id,
            'name': movie.name,
            'userRated': false,
            'userRating': null,
        };
        saveUserAttributes(attributesManager, 'recommendedMovies', recommendedMovieAttributes);        
        
        return movie;
}

function recommendMovieNowSpeakOutput(movie) {
    return `Try ${movie.name}. Rated ${movie.rating} and has a ${movie.userRating} rating on Rotten Tomatoes voted by ${movie.userRatingCount} fans.
            In this movie, ${movie.description}.
            Hope you like it!`;
}

function isAlexaHosted() {
    return process.env.S3_PERSISTENCE_BUCKET ? true : false;
}

// This function establishes the primary key of the database as the device id (hence you get per device persistence)
function keyGenerator(requestEnvelope) {
    if (requestEnvelope
        && requestEnvelope.context
        && requestEnvelope.context.System
        && requestEnvelope.context.System.device
        && requestEnvelope.context.System.device.deviceId) {
      return requestEnvelope.context.System.device.deviceId; 
    }
    throw 'Cannot retrieve device id from request envelope!';
}

// 4. Request Interceptors ======================================================================
// Info: https://developer.amazon.com/en-US/docs/alexa/alexa-skills-kit-sdk-for-nodejs/manage-attributes.html

const LocalizationInterceptor = {
    process(handlerInput) {
        const localizationClient = i18n.use(sprintf).init({
            lng: handlerInput.requestEnvelope.request.locale,
            overloadTranslationOptionHandler: sprintf.overloadTranslationOptionHandler,
            fallbackLng: 'en', // fallback to EN if locale doesn't exist
            resources: languageStrings,
            returnObjects: true,
        });

        // use the sprintf functionality of the i18next-sprintf-postprocessor/
        // automatically pick a response at random if a specific key (like 'WELCOME') has an array of possible responses.
        localizationClient.localize = function () {
            const args = arguments;
            let values = [];

            for (var i = 1; i < args.length; i++) {
                values.push(args[i]);
            }
            const value = i18n.t(args[0], {
                returnObjects: true,
                postProcess: 'sprintf',
                sprintf: values
            });

            if (Array.isArray(value)) {
                return value[Math.floor(Math.random() * value.length)];
            } else {
                return value;
            }
        }
                
        const attributes = handlerInput.attributesManager.getRequestAttributes();
        attributes.t = function (...args) { // pass on arguments to the localizationClient
            return localizationClient.localize(...args);
        };
    },
};


// This request interceptor with each new session loads all persistent attributes by deviceId
// into the session attributes and increments a launch counter
const PersistenceRequestInterceptor = { 
  process(handlerInput) { 
      if (handlerInput.requestEnvelope.session['new']) {
          return new Promise((resolve, reject) => {
              handlerInput.attributesManager.getPersistentAttributes()
                  .then((persistentAttributes) => {
                      persistentAttributes = persistentAttributes || {};
                      
                      if (!persistentAttributes['launchCount']) {
                        persistentAttributes['launchCount'] = 0;
                      }
                      persistentAttributes['launchCount'] += 1; 
                      
                      // use session attribute to manage user state
                      if (!persistentAttributes['userState']) {
                          persistentAttributes['userState'] = 'LAUNCH';
                      }
                      persistentAttributes['userState'] = 'LAUNCH';
                      
                      handlerInput.attributesManager.setSessionAttributes(persistentAttributes); 
                      resolve();
                  })
                  .catch((err) => {
                    reject(err); 
                  });
          }); 
      }
  } 
};

// 5. Response Interceptors ======================================================================
// Info: https://developer.amazon.com/en-US/docs/alexa/alexa-skills-kit-sdk-for-nodejs/manage-attributes.html

// This response interceptor stores all session attributes into persistent attributes
// when the session ends and it stores the skill last used timestamp
const PersistenceResponseInterceptor = { 
  process(handlerInput, responseOutput) { 
      const ses = (typeof responseOutput.shouldEndSession === "undefined" ? true : responseOutput.shouldEndSession); 
      if (ses || handlerInput.requestEnvelope.request.type === 'SessionEndedRequest') { // skill was stopped or timed out 
          let sessionAttributes = handlerInput.attributesManager.getSessionAttributes(); 
          sessionAttributes['lastUseTimestamp'] = new Date(handlerInput.requestEnvelope.request.timestamp).getTime(); 
          handlerInput.attributesManager.setPersistentAttributes(sessionAttributes); 
          
          return new Promise((resolve, reject) => { 
              handlerInput.attributesManager.savePersistentAttributes() 
                  .then(() => { 
                      resolve(); 
                  }) 
                  .catch((err) => { 
                      reject(err); 
                  }); 
          }); 
      } 
  } 
};

// 6. Export =====================================================================================

const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
    .withSkillId(process.env.SKILLID)
    .withPersistenceAdapter(persistenceAdapter)
    .addRequestHandlers(
        ReturnUserHandler,
        LaunchHandler,
        CaptureGenreIntentHandler,
        CaptureActorIntentHandler,     
        RecommendMovieIntentHandler,
        CapturePreferenceIntentHandler,
        CaptureRatingIntentHandler,
        YesNoHandler,
        HelpHandler,
        StopHandler,
        FallbackHandler,
        SessionEndedHandler
    )
    .addRequestInterceptors(
        LocalizationInterceptor,
        PersistenceRequestInterceptor
    )
    .addResponseInterceptors(PersistenceResponseInterceptor)
    .addErrorHandlers(ErrorHandler)
    .lambda();
