"""
Script to import Shimajiro English YouTube playlists into kc-kids-video-app D1 database.
Categorizes videos into:
1. 巧虎英文 - 動畫 (shimajiro-english-animation, leisure)
2. 巧虎英文 - 兒歌與其他 (shimajiro-english-songs, leisure)
"""
import json
import os
import subprocess

playlists = [
    # Animation
    {"id": "PLujcj3l-NerK7P2xMKyzwTCQTY4NBfylx", "title": "Story Animation - Curiosity", "group": "animation"},
    {"id": "PLujcj3l-NerL2QfaHxeUOCUWK650bNWCq", "title": "Story Animation - Social Skills", "group": "animation"},
    {"id": "PLujcj3l-NerKMdnNtoANwsjPFtwFw_oXC", "title": "Shimajiro 2D Full Episodes", "group": "animation"},
    {"id": "PLujcj3l-NerLvDIyIZEeI4J6bGKT4s5Gf", "title": "Shimajiro 3D Kids video", "group": "animation"},
    {"id": "PLujcj3l-NerLDZCqRgvzHHqSKHB1qqM_r", "title": "Shimajiro 3D Animation Full Episode", "group": "animation"},
    {"id": "PLujcj3l-NerLG5ZxtRUzUgc2wUrqD4yWL", "title": "Shimajiro Full Episodes - 24 minute Compilation", "group": "animation"},
    {"id": "PLujcj3l-NerLssu0YbdFkOTeFGcQfT38R", "title": "Shimajiro Adventure Special", "group": "animation"},
    {"id": "PLujcj3l-NerIJ0uO9SNEehDVXQWFmmAS6", "title": "Shimajiro Animation", "group": "animation"},

    # Songs & Others
    {"id": "PLujcj3l-NerL4wBW0suM9RpNGomYR5mIl", "title": "Learning with Shimajiro", "group": "songs_other"},
    {"id": "PLujcj3l-NerJdIwdYZUIVKN9u5ReOPutI", "title": "Earth Day", "group": "songs_other"},
    {"id": "PLujcj3l-NerJuw9GisD2GGT26mNzC_Fnx", "title": "Easter", "group": "songs_other"},
    {"id": "PLujcj3l-NerLT-Wc_0VUMFLZiQo3vc05R", "title": "Hannah and Shimajiro Nursery Rhymes", "group": "songs_other"},
    {"id": "PLujcj3l-NerJwuawdjWdiJwaomlnmMo9m", "title": "Happy Holidays", "group": "songs_other"},
    {"id": "PLujcj3l-NerKWnw_eckjou_E8lS3EYemy", "title": "Halloween", "group": "songs_other"},
    {"id": "PLujcj3l-NerIWXEnnZMT8hSjDFZt6gI4n", "title": "Nursery Rhymes Hit Songs", "group": "songs_other"},
    {"id": "PLujcj3l-NerLq5_Q2NpocFUGR1Dhp03lm", "title": "Learn good habits with Shimajiro", "group": "songs_other"},
    {"id": "PLujcj3l-NerL12C4GR3mzAmTyjSIzZQoB", "title": "Nursery Rhymes Compilations", "group": "songs_other"},
    {"id": "PLujcj3l-NerIZ9HPxoumfPHsd-yUemlVH", "title": "Shimajiro Brother & Sister", "group": "songs_other"},
    {"id": "PLujcj3l-NerLdUr6FzC0EF0i-fO4M4rvF", "title": "Father's Special", "group": "songs_other"},
    {"id": "PLujcj3l-NerJXHc_I4S-Yhv-2ECk6Z1Rc", "title": "Earth Day Special", "group": "songs_other"},
    {"id": "PLujcj3l-NerIe1MfIAXNmAkkynFq8d-ot", "title": "Mum & Me", "group": "songs_other"},
    {"id": "PLujcj3l-NerJUSsXJph9TxBprIWufIj5B", "title": "Healthy Habits for Kids", "group": "songs_other"},
    {"id": "PLujcj3l-NerI12Ox0TZHySfjX1lxk-0-O", "title": "Compilations", "group": "songs_other"},
    {"id": "PLujcj3l-NerKItenUft8XPwHHYTDG5LPa", "title": "Nursery Rhymes & Kids Songs", "group": "songs_other"},
    {"id": "PLujcj3l-NerIWrbYTXT2Hs5DmU8y-0IRr", "title": "Play at Home with Shimajiro", "group": "songs_other"},
    {"id": "PLujcj3l-NerL8rYo9TUn0RN0SpB9Sk7iR", "title": "Shimajiro and Friends", "group": "songs_other"},
    {"id": "PLujcj3l-NerKoNWC97E4X0ye81mgGPI7h", "title": "Shimajiro and Family", "group": "songs_other"},
]

def main():
    print("Shimajiro English import configuration.")

if __name__ == "__main__":
    main()
