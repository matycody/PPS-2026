// "Elegí tus favoritos" se muestra una vez por persona y por dispositivo (al omitirlo o terminarlo queda marcado)
const key = (uid) => 'onb-done:' + uid
export const onboardingDone = (uid) => { try { return localStorage.getItem(key(uid)) === '1' } catch { return true } }
export const markOnboarding = (uid) => { try { localStorage.setItem(key(uid), '1') } catch { /* sin storage: no insiste */ } }
