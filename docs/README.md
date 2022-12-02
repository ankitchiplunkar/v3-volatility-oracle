### Setup

- Docs are made using [mkdocs](https://www.mkdocs.org/)

1. Clone the repo
2. Create a virtual enviornment

```
    virtualenv -p python3.8 venv
    source venv/bin/activate
```

3. Install dependencies `pip3 install -r requirements.txt`
4. Start a local server `mkdocs serve`
5. Make changes and update local/origin master
6. Once you make an update, and push to main, you can then run `mkdocs gh-deploy` to deploy the site live.
