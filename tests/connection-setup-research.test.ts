import {expect,it} from 'vitest';
import {connectionSetupAddress,documentedConnectionSetup} from '../src/connections/setup-research.js';

it('retains a documented API prefix and avoids adding it twice',()=>{
 expect(connectionSetupAddress('https://api.example.test/client/v4','/user/tokens/verify')).toEqual({baseUrl:'https://api.example.test',validationPath:'/client/v4/user/tokens/verify'});
 expect(connectionSetupAddress('https://api.example.test/client/v4/','/client/v4/user/tokens/verify').validationPath).toBe('/client/v4/user/tokens/verify');
});
it('uses the full documented request URL to fix a missing prefix before posting a key card',()=>{
 const setup=documentedConnectionSetup('https://api.example.test','/user/tokens/verify','GET /user/tokens/verify. curl https://api.example.test/client/v4/user/tokens/verify -H "Authorization: Bearer YOUR_TOKEN"');
 expect(setup.validationPath).toBe('/client/v4/user/tokens/verify');
});
it('refuses unrelated, ambiguous or unconfirmed authentication instead of guessing',()=>{
 expect(()=>documentedConnectionSetup('https://api.example.test','/me','curl https://other.example.test/me Bearer')).toThrow('does not establish');
 expect(()=>documentedConnectionSetup('https://api.example.test','/me','https://api.example.test/v1/me https://api.example.test/v2/me Bearer')).toThrow('multiple');
 expect(()=>documentedConnectionSetup('https://api.example.test','/me','https://api.example.test/me OAuth')).toThrow('authentication');
 expect(()=>connectionSetupAddress('https://user:password@api.example.test','/me')).toThrow('without credentials');
});
it('accepts documented relative routes with an explicit base and a custom authentication header',()=>{
 expect(documentedConnectionSetup('https://api.example.test/api/v2','/me','API base: https://api.example.test/api/v2\nGET /me\nX-API-Key header',{type:'header',header:'X-API-Key'}).validationPath).toBe('/api/v2/me');
});
