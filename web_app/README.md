## 로컬 빌드
cd web_app
npm run dev

## firebase hosting 업로드

# hosting만 배포
firebase deploy --only hosting

# functions만 배포
firebase deploy --only functions

# 둘 다 배포
firebase deploy