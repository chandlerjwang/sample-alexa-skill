## Skill Description

Movie Now is a sample Alexa Skill that can learn about the user's movie preferences such as favorite genres or actors, then recommends movies users will enjoy!

If the user wants to skip the series of questions they can say things like "Surprise me" or "pick one for me" and the skill will intelligently pick a movie at random or based on saved preferences. Further, the skill asks all returned users (based on distinct deviceID) to rate the previous recommendation and incorporates that rating for future suggestions. In this way, the skill can evolve and learns the users' preferences and make better and more personalized recommendations.

## Example Phrases

- "I like Comedy"
- "I'm a fan of Tom Cruise"
- "Surprise me!"
- "I really enjoy sci-fi movies"
- "Pick another one for me"
- "Something classic"

## Future Releases & Optimization

- Testing: Add automated testing for Voice (unit, integration and UATs)
- Data: Integrate with real movie dataset
- Machine Learning: Refine personalization for movie recommendation based on persisted user preferences
- Voice: Add more intents to handle additional voice interactions

## ASK Improvement Suggestions

- Development: faster local development (not having to deploy to prod everytime a change is made)
- IDE: more integrated dev env similar to Xcode
- Simulator: more robust outputs/logs from simulator
- Naive Handlers: provide more optiosn to augment to AMAZON.YesIntent to handle more scenarios where users might say yes

## Technical Documentation & Related Resources

- [Traning Courses](https://developer.amazon.com/en-US/alexa/alexa-skills-kit/resources/training-resources/)
- [Build Alexa Hosted Skill](https://developer.amazon.com/docs/hosted-skills/build-a-skill-end-to-end-using-an-alexa-hosted-skill.html)
- [Session Persistence & Attributes](https://ask-sdk-for-nodejs.readthedocs.io/en/latest/Managing-Attributes.html)
- [Setup ASK-CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html)
- [Create New Skill via CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/ask-cli-intro.html#create-new-skill)
- [Setup AWS Credentials](https://developer.amazon.com/en-US/docs/alexa/smapi/manage-credentials-with-ask-cli.html#create-aws-credentials)
- [Dialog Model](https://developer.amazon.com/en-US/docs/alexa/custom-skills/define-the-dialog-to-collect-and-confirm-required-information.html)
- [Slot Types](https://developer.amazon.com/en-US/docs/alexa/custom-skills/slot-type-reference.html)
- [Localize Skills](https://developer.amazon.com/blogs/alexa/post/285a6778-0ed0-4467-a602-d9893eae34d7/how-to-localize-your-alexa-skills)
- [Interceptors](https://developer.amazon.com/blogs/alexa/post/0e2015e1-8be3-4513-94cb-da000c2c9db0/what-s-new-with-request-and-response-interceptors-in-the-alexa-skills-kit-sdk-for-node-js)
- [Intents, Utterances, and Slots](https://developer.amazon.com/en-US/docs/alexa/custom-skills/create-intents-utterances-and-slots.html#intent-name)
- [SDK on Github](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs)

