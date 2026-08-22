# Archillery

My experiment on hosting git using Archil on cloudflare infra. 

It's not done yet and currently 

- it's slow (coldstart are in range of 5 seconds), 
- it's inefficient (it uses 1 container for 1 repo), 
- it does not scale (it does not support read replica). 

I am working on fixing all of these things and maybe even build a nicer web ui instead of cgit 
